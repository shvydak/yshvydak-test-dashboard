import {runProcessRegistry} from './runProcessRegistry.service'
import {WebSocketService} from './websocket.service'
import {CI_PIPELINE_DRAIN_ORDER, CIPipelineName} from '../utils/ciPipeline.util'
import {createCIRunQueuedError} from '../utils/ciRunQueued.util'
import {Logger} from '../utils/logger.util'

export interface QueuedPipelineRequest {
    pipeline: CIPipelineName
    maxWorkers?: number
    queuedAt: string
}

// Single owner of "busy" (live child process, running pipeline, run still starting, stop in progress) and of the per-pipeline CI queue.
export class CIRunQueueService {
    private startingCount = 0
    private stoppingCount = 0
    private startSettledWaiters: Array<() => void> = []
    private slots = new Map<CIPipelineName, QueuedPipelineRequest>()
    private pipelineRunningProvider: () => boolean = () => false
    private drainHandler: (() => Promise<void>) | null = null

    constructor(private websocketService: WebSocketService) {}

    registerPipelineRunning(provider: () => boolean): void {
        this.pipelineRunningProvider = provider
    }

    registerDrainHandler(handler: () => Promise<void>): void {
        this.drainHandler = handler
    }

    // ignorePipeline: a pipeline's own step must not see its own running flag.
    isBusy(options: {ignorePipeline?: boolean} = {}): boolean {
        return (
            runProcessRegistry.isAnyRunning() ||
            (!options.ignorePipeline && this.pipelineRunningProvider()) ||
            this.startingCount > 0 ||
            this.stoppingCount > 0
        )
    }

    /** Marks a run as starting; call the returned function once the tracker (or pipeline) owns it. */
    beginStarting(): () => void {
        this.startingCount++
        let released = false
        return () => {
            if (released) return
            released = true
            this.startingCount--
            if (this.startingCount === 0) {
                this.startSettledWaiters.splice(0).forEach((resolve) => resolve())
                // A failed start (no process ever closes) would leave a queued request waiting forever.
                setImmediate(() => this.requestDrain())
            }
        }
    }

    /** Marks a stop as in progress: the dashboard stays busy until cleanup is done, then drains. */
    beginStopping(): () => void {
        this.stoppingCount++
        let released = false
        return () => {
            if (released) return
            released = true
            this.stoppingCount--
            if (this.stoppingCount === 0) setImmediate(() => this.requestDrain())
        }
    }

    isStopping(): boolean {
        return this.stoppingCount > 0
    }

    /** Resolves once no run is in its starting phase (a Stop waits for those to notice it and unwind). */
    waitForStartsToSettle(): Promise<void> {
        if (this.startingCount === 0) return Promise.resolve()
        return new Promise((resolve) => this.startSettledWaiters.push(resolve))
    }

    hasQueued(): boolean {
        return this.slots.size > 0
    }

    /** Queued requests in drain order: production, develop, then any other. */
    getQueue(): QueuedPipelineRequest[] {
        const ordered: QueuedPipelineRequest[] = []
        for (const name of CI_PIPELINE_DRAIN_ORDER) {
            const slot = this.slots.get(name)
            if (slot) ordered.push(slot)
        }
        for (const [name, slot] of this.slots) {
            if (!CI_PIPELINE_DRAIN_ORDER.includes(name)) ordered.push(slot)
        }
        return ordered
    }

    /** Fills the pipeline's slot; returns true when it replaced an older queued request. */
    enqueue(pipeline: CIPipelineName, maxWorkers?: number): boolean {
        const replaced = this.slots.has(pipeline)
        this.slots.set(pipeline, {pipeline, maxWorkers, queuedAt: new Date().toISOString()})
        Logger.info(`CI run queued: ${pipeline}${replaced ? ' (replaced the older request)' : ''}`)
        this.broadcastQueue()
        return replaced
    }

    /** Puts a request back only if no newer request took the slot meanwhile. */
    requeue(request: QueuedPipelineRequest): void {
        if (this.slots.has(request.pipeline)) return
        this.slots.set(request.pipeline, request)
        this.broadcastQueue()
    }

    takeNext(): QueuedPipelineRequest | undefined {
        const next = this.getQueue()[0]
        if (!next) return undefined
        this.slots.delete(next.pipeline)
        this.broadcastQueue()
        return next
    }

    /** Manual (non-CI) starts are refused while a CI request waits for its turn. */
    assertManualStartAllowed(): void {
        if (this.hasQueued()) throw createCIRunQueuedError()
    }

    requestDrain(): void {
        if (!this.drainHandler || !this.hasQueued()) return
        this.drainHandler().catch((error) => Logger.error('CI queue drain failed', error))
    }

    private broadcastQueue(): void {
        this.websocketService.broadcastPipelineQueueChanged(this.getQueue())
    }
}

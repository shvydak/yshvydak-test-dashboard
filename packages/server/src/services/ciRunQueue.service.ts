import {activeProcessesTracker} from './activeProcesses.service'
import {WebSocketService} from './websocket.service'
import {CI_PIPELINE_DRAIN_ORDER, CIPipelineName} from '../utils/ciPipeline.util'
import {createCIRunQueuedError} from '../utils/ciRunQueued.util'
import {Logger} from '../utils/logger.util'

export interface QueuedPipelineRequest {
    pipeline: CIPipelineName
    maxWorkers?: number
    queuedAt: string
}

// Single owner of "busy" (tracked process, running pipeline, run still starting) and of the per-pipeline CI queue.
export class CIRunQueueService {
    private startingCount = 0
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
            activeProcessesTracker.isAnyProcessRunning() ||
            (!options.ignorePipeline && this.pipelineRunningProvider()) ||
            this.startingCount > 0
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
            // A failed start (no process ever closes) would leave a queued request waiting forever.
            if (this.startingCount === 0) setImmediate(() => this.requestDrain())
        }
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

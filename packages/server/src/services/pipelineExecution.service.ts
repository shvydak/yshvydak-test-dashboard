import {v4 as uuidv4} from 'uuid'
import {TestService} from './test.service'
import {SettingsService} from './settings.service'
import {RunRepository} from '../repositories/run.repository'
import {WebSocketService, PipelineStepSummary, PipelineFinishStatus} from './websocket.service'
import {activeProcessesTracker} from './activeProcesses.service'
import {runProcessRegistry} from './runProcessRegistry.service'
import {CIRunQueueService, QueuedPipelineRequest} from './ciRunQueue.service'
import {CINotifierService} from './ciNotifier.service'
import {config} from '../config/environment.config'
import {RUN_STOP} from '../config/constants'
import {Logger} from '../utils/logger.util'
import {CIPipelineName, DEFAULT_CI_PIPELINE} from '../utils/ciPipeline.util'
import {parseServiceError} from '../utils/ciRunQueued.util'
import {RUN_CANCELLED_CODE, StopReason} from '../utils/runStop.util'
import {killLeftoverPlaywrightGroups} from '../utils/processGroup.util'

const FINISHED_PIPELINES_KEPT = 10

export type PipelineStatus = 'running' | PipelineFinishStatus

export interface PipelineState {
    pipelineRunId: string
    pipeline: CIPipelineName
    status: PipelineStatus
    steps: PipelineStepSummary[]
    startedAt: string
    source?: string
    // The request asked for a Slack result message (CI scripts without --wait).
    notify: boolean
}

export type PipelineRunRequestResult =
    | {status: 'started'; pipeline: PipelineState}
    | {status: 'queued'; pipeline: CIPipelineName}

export interface PipelineRunRequest {
    maxWorkers?: number
    source?: string
    pipeline?: CIPipelineName
    notify?: boolean
}

export interface StopOutcome {
    // False when nothing was running.
    stopped: boolean
    reason?: StopReason
    pipelineRunId?: string
    runIds: string[]
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export class PipelineExecutionService {
    private currentPipeline: PipelineState | null = null
    private pipelineLoops = new Map<string, Promise<void>>()
    // Stop generation seen when each pipeline began: a newer one means a Stop was requested since.
    private startGenerations = new Map<string, number>()
    private stopInFlight: Promise<StopOutcome> | null = null
    private watchdog: ReturnType<typeof setTimeout> | null = null
    private timedOutPipelineRunIds = new Set<string>()
    private draining = false
    // A queued pipeline can start the moment the previous one finishes; --wait pollers still need the final state.
    private finishedPipelines = new Map<string, PipelineState>()

    constructor(
        private testService: TestService,
        private settingsService: SettingsService,
        private runRepository: RunRepository,
        private websocketService: WebSocketService,
        private ciRunQueue: CIRunQueueService,
        private ciNotifier: CINotifierService
    ) {
        this.ciRunQueue.registerPipelineRunning(() => this.currentPipeline?.status === 'running')
        this.ciRunQueue.registerDrainHandler(() => this.drainQueue())
    }

    getPipeline(pipelineRunId: string): PipelineState | null {
        if (this.currentPipeline?.pipelineRunId === pipelineRunId) {
            return this.currentPipeline
        }
        return this.finishedPipelines.get(pipelineRunId) ?? null
    }

    getCurrentPipeline(): PipelineState | null {
        return this.currentPipeline
    }

    getQueue(): QueuedPipelineRequest[] {
        return this.ciRunQueue.getQueue()
    }

    // Entry for POST /api/pipeline/run: only script+notify requests queue while busy, the rest keep the 409.
    async requestPipelineRun(request: PipelineRunRequest): Promise<PipelineRunRequestResult> {
        const pipelineName = request.pipeline ?? DEFAULT_CI_PIPELINE

        if (request.source === 'script' && request.notify === true && this.ciRunQueue.isBusy()) {
            await this.assertAutoRunNotPaused(request.source)
            await this.assertPipelineNotEmpty(pipelineName)

            // Re-check with no await before enqueue: the run may have ended during the checks above.
            if (this.ciRunQueue.isBusy()) {
                this.ciRunQueue.enqueue(pipelineName, request.maxWorkers)
                return {status: 'queued', pipeline: pipelineName}
            }
        }

        const pipeline = await this.startPipeline(
            request.maxWorkers,
            request.source,
            pipelineName,
            {
                notify: request.notify === true,
            }
        )
        return {status: 'started', pipeline}
    }

    // Returns the initial state at once; steps run sequentially in the background.
    async startPipeline(
        maxWorkers?: number,
        source?: string,
        pipelineName: CIPipelineName = DEFAULT_CI_PIPELINE,
        options: {notify?: boolean} = {}
    ): Promise<PipelineState> {
        // Same guard checks TestService.runAllTests performs, done once here so
        // the caller gets a synchronous 409/423 instead of it surfacing mid-chain.
        // Pause is global: every script-triggered pipeline (any name) is blocked.
        // UI-triggered runs (no source=script) are unaffected.
        await this.assertAutoRunNotPaused(source)

        if (source !== 'script') {
            this.ciRunQueue.assertManualStartAllowed()
        }

        if (this.ciRunQueue.isBusy()) {
            throw this.createAlreadyRunningError()
        }

        // Captured with the starting claim (no await since the busy check): a Stop that lands from here on bumps it.
        const stopGeneration = runProcessRegistry.getStopGeneration()

        // Held until currentPipeline exists: the awaits below must not look idle to a second request.
        const releaseStarting = this.ciRunQueue.beginStarting()
        let pipeline: PipelineState
        try {
            const configuredSteps = await this.settingsService.getPipelineSteps(pipelineName)
            if (configuredSteps.length === 0) {
                throw this.createPipelineEmptyError(pipelineName)
            }

            const steps: PipelineStepSummary[] = configuredSteps.map((s) => ({
                project: s.project,
                displayName: s.displayName,
                stopOnFailure: s.stopPipelineOnFailure,
                status: 'queued',
                workers: s.workers,
            }))

            pipeline = {
                pipelineRunId: uuidv4(),
                pipeline: pipelineName,
                status: 'running',
                steps,
                startedAt: new Date().toISOString(),
                source,
                notify: options.notify === true,
            }
            this.currentPipeline = pipeline
            this.startGenerations.set(pipeline.pipelineRunId, stopGeneration)
        } finally {
            releaseStarting()
        }

        this.startWatchdog(pipeline)
        this.websocketService.broadcastPipelineStarted(pipeline.pipelineRunId, pipeline.steps)

        const loop = this.runSteps(pipeline.pipelineRunId, maxWorkers, source).catch((error) => {
            Logger.error('Pipeline execution failed unexpectedly', error)
            const running = this.getPipeline(pipeline.pipelineRunId)
            if (running?.status === 'running') {
                this.finish(running, 'stopped_early')
            }
        })
        this.pipelineLoops.set(pipeline.pipelineRunId, loop)

        return pipeline
    }

    // Startup, before anything runs: kills the marker's leftover groups and deletes the marker's runIds only (old stuck `running` rows are history).
    async handleInterruptedOnStartup(): Promise<void> {
        try {
            const marker = await this.settingsService.getInFlightPipeline()
            const runMarker = await this.settingsService.getInFlightRun()
            if (!marker && !runMarker) return

            const killed = await killLeftoverPlaywrightGroups([
                ...(marker?.pgids ?? []).map((pgid) => ({
                    pgid,
                    markerWrittenAt: marker?.writtenAt,
                })),
                ...(runMarker?.pgid
                    ? [{pgid: runMarker.pgid, markerWrittenAt: runMarker.startedAt}]
                    : []),
            ])
            if (killed.length > 0) {
                Logger.warn(`Killed leftover Playwright process group(s): ${killed.join(', ')}`)
            }

            if (marker) {
                Logger.warn(
                    `CI pipeline "${marker.pipeline}" was interrupted by a restart (started ${marker.startedAt})`
                )
                await this.discardInterrupted(
                    marker.runIds,
                    marker.projects.map((project) => ({project, since: marker.startedAt}))
                )
                await this.settingsService.clearInFlightPipeline()

                if (marker.notify) {
                    this.ciNotifier
                        .notifyInterrupted(marker.pipeline, marker.projects)
                        .catch((error) =>
                            Logger.error('Interrupted-run notification failed', error)
                        )
                }
            }

            if (runMarker) {
                Logger.warn(`Run ${runMarker.runId} was interrupted by a restart`)
                // Whatever status the killed run reached (its reporter may have marked it failed), it was cut short.
                await this.discardInterrupted(
                    [runMarker.runId],
                    runMarker.pendingSince
                        ? [
                              {
                                  project: runMarker.project ?? undefined,
                                  since: runMarker.pendingSince,
                              },
                          ]
                        : []
                )
                await this.settingsService.clearInFlightRun()
            }
        } catch (error) {
            Logger.error('Failed to process the in-flight run markers', error)
        }
    }

    private async discardInterrupted(
        runIds: string[],
        scopes: Array<{project?: string; since: string}>
    ): Promise<void> {
        try {
            await this.testService.discardRuns(runIds, scopes)
        } catch (error) {
            Logger.error('Failed to delete the data of the interrupted run', error)
        }
    }

    isStopping(): boolean {
        return this.stopInFlight !== null
    }

    // Stops everything active and deletes what it wrote; resolves after cleanup, a second call joins the first.
    async stop(reason: StopReason): Promise<StopOutcome> {
        if (this.stopInFlight) return this.stopInFlight
        if (!this.ciRunQueue.isBusy()) return {stopped: false, runIds: []}

        // performStop runs synchronously up to its first await: flags are set before anyone else runs.
        this.stopInFlight = this.performStop(reason).finally(() => {
            this.stopInFlight = null
        })
        return this.stopInFlight
    }

    // Stop order: cancel flags -> signal -> wait for close + late reporter posts -> delete -> end the pipeline.
    private async performStop(reason: StopReason): Promise<StopOutcome> {
        // Busy (and so no new start) until cleanup is done; releasing it drains the queue.
        const releaseStopping = this.ciRunQueue.beginStopping()
        try {
            runProcessRegistry.beginStop()
            const live = runProcessRegistry.getRuns()
            runProcessRegistry.markCancelled([
                ...live.map((r) => r.runId),
                ...this.stepRunIds(this.runningPipeline()),
            ])
            this.websocketService.broadcastRunStopping(reason)
            Logger.warn(`Stopping the active run(s), reason: ${reason}`)

            const closed = live.map((r) => runProcessRegistry.terminate(r.runId))

            // Starts still in discovery/lookups notice the new generation and unwind without spawning.
            await this.ciRunQueue.waitForStartsToSettle()

            const pipeline = this.runningPipeline()
            const loop = pipeline ? this.pipelineLoops.get(pipeline.pipelineRunId) : undefined
            await Promise.all([...closed, loop])
            await sleep(RUN_STOP.LATE_POSTS_GRACE_MS)

            const pipelineRunIds = this.stepRunIds(pipeline)
            const standalone = live.filter((r) => !pipelineRunIds.includes(r.runId))
            const runIds = [...new Set([...pipelineRunIds, ...live.map((r) => r.runId)])]
            runProcessRegistry.markCancelled(runIds)

            const discoveryScopes = [
                ...(pipeline
                    ? pipeline.steps.map((s) => ({project: s.project, since: pipeline.startedAt}))
                    : []),
                ...standalone.flatMap((r) =>
                    r.pendingSince ? [{project: r.project, since: r.pendingSince}] : []
                ),
            ]
            // A failed delete must still end the pipeline and free the dashboard; the error is rethrown below (HTTP 500).
            let cleanupError: unknown
            try {
                await this.testService.discardRuns(runIds, discoveryScopes)
                await this.testService.clearRunMarker()
            } catch (error) {
                cleanupError = error
                Logger.error(
                    `STOP CLEANUP FAILED: the stopped run(s) may still have rows or files; delete them by hand (run ids: ${runIds.join(', ') || 'none'})`,
                    error
                )
            }
            for (const runId of runIds) {
                // A late reporter post must not leave a ghost "running" entry behind.
                if (activeProcessesTracker.isProcessRunning(runId)) {
                    activeProcessesTracker.removeProcess(runId)
                }
            }

            if (pipeline) this.finishCancelled(pipeline, reason)
            this.websocketService.broadcastRunCancelled(runIds, reason, pipeline?.pipelineRunId)

            if (cleanupError) throw cleanupError
            return {stopped: true, reason, pipelineRunId: pipeline?.pipelineRunId, runIds}
        } catch (error) {
            Logger.error('Stop failed', error)
            throw error
        } finally {
            releaseStopping()
        }
    }

    // The pipeline's results are gone, so its steps read as never run.
    private finishCancelled(pipeline: PipelineState, reason: StopReason): void {
        for (const step of pipeline.steps) {
            step.status = 'skipped'
            delete step.runId
            delete step.passed
            delete step.failed
        }
        this.finish(pipeline, 'cancelled', reason)
    }

    // A timeout was already announced by the watchdog; a restart is announced at startup.
    private notifyCancelled(pipeline: PipelineState, reason?: StopReason): void {
        const projects = pipeline.steps.map((s) => s.project)
        if (reason === 'manual') {
            this.ciNotifier
                .notifyStopped(pipeline.pipeline, projects)
                .catch((error) => Logger.error('Stopped notification failed', error))
        } else if (reason === 'replaced') {
            this.ciNotifier
                .notifyReplaced(pipeline.pipeline, projects)
                .catch((error) => Logger.error('Replaced notification failed', error))
        }
    }

    private runningPipeline(): PipelineState | null {
        return this.currentPipeline?.status === 'running' ? this.currentPipeline : null
    }

    private stepRunIds(pipeline: PipelineState | null): string[] {
        return pipeline ? pipeline.steps.flatMap((s) => (s.runId ? [s.runId] : [])) : []
    }

    // True once a Stop was requested after this pipeline began, or the server is shutting down.
    private shouldHalt(pipeline: PipelineState): boolean {
        if (runProcessRegistry.isShuttingDown()) return true
        const startGeneration = this.startGenerations.get(pipeline.pipelineRunId)
        return (
            startGeneration !== undefined &&
            runProcessRegistry.getStopGeneration() !== startGeneration
        )
    }

    private async runSteps(
        pipelineRunId: string,
        maxWorkers?: number,
        source?: string
    ): Promise<void> {
        const pipeline = this.getPipeline(pipelineRunId)
        if (!pipeline) return

        await this.persistMarker(pipeline)

        for (const step of pipeline.steps) {
            // A Stop (or shutdown) owns the ending from here: this loop only has to stop spawning.
            if (this.shouldHalt(pipeline)) return

            // Between steps only: the running step always finishes; its results stay.
            if (await this.isAutoRunPaused(source)) {
                if (this.shouldHalt(pipeline)) return
                this.skipRemaining(pipeline, step)
                this.finish(pipeline, 'paused')
                return
            }
            if (this.shouldHalt(pipeline)) return

            step.status = 'running'

            let result: any
            try {
                result = await this.testService.runAllTests(
                    step.workers ?? maxWorkers,
                    false,
                    step.project,
                    source,
                    {pipelineStep: true}
                )
            } catch (error) {
                const errorCode = parseServiceError(error).code
                if (errorCode === RUN_CANCELLED_CODE || this.shouldHalt(pipeline)) return
                if (errorCode === 'CI_AUTORUN_PAUSED') {
                    // Paused between our check and the spawn: not a failure of this step.
                    step.status = 'queued'
                    this.skipRemaining(pipeline, step)
                    this.finish(pipeline, 'paused')
                    return
                }
                Logger.error(`Pipeline step failed to start: ${step.project}`, error)
                step.status = 'failed'
                this.websocketService.broadcastPipelineStepCompleted(pipelineRunId, step)
                this.stopRemaining(pipeline, step)
                this.finish(pipeline, 'stopped_early')
                return
            }

            step.runId = result.runId
            // Attached before any await: a fast-exiting child must not be missed.
            const closed = this.waitForProcessClose(result.process)
            await this.persistMarker(pipeline)
            this.websocketService.broadcastPipelineStepStarted(
                pipelineRunId,
                step.project,
                result.runId
            )

            await closed

            // Stopped (or shutting down) while this step ran: its results are deleted, not read.
            if (this.shouldHalt(pipeline)) return

            const run = await this.runRepository.getTestRun(result.runId)
            const passed = run?.passedTests ?? 0
            const failed = run?.failedTests ?? 0

            step.passed = passed
            step.failed = failed

            // Run row still 'running' after close = reporter onEnd never landed; 0/0 must not read as success.
            if (run?.status === 'running') {
                Logger.error(
                    `Pipeline step crashed: ${step.project} — process closed but run ${result.runId} is still running`
                )
                step.status = 'failed'
                this.websocketService.broadcastPipelineStepCompleted(pipelineRunId, step)
                this.stopRemaining(pipeline, step)
                this.finish(pipeline, 'stopped_early')
                return
            }

            step.status = failed > 0 ? 'failed' : 'success'

            this.websocketService.broadcastPipelineStepCompleted(pipelineRunId, step)

            if (failed > 0 && step.stopOnFailure) {
                this.stopRemaining(pipeline, step)
                this.finish(pipeline, 'stopped_early')
                return
            }
        }

        this.finish(pipeline, 'completed')
    }

    private waitForProcessClose(
        process:
            | {
                  once: (event: 'close', listener: () => void) => void
                  exitCode?: number | null
                  signalCode?: string | null
              }
            | undefined
    ): Promise<void> {
        return new Promise((resolve) => {
            // Already exited: 'close' will not fire again.
            if (!process || typeof process.exitCode === 'number' || process.signalCode) {
                resolve()
                return
            }
            process.once('close', () => resolve())
        })
    }

    private stopRemaining(pipeline: PipelineState, failedStep: PipelineStepSummary): void {
        const failedIndex = pipeline.steps.indexOf(failedStep)
        for (let i = failedIndex + 1; i < pipeline.steps.length; i++) {
            pipeline.steps[i].status = 'skipped'
        }
    }

    // Marks `firstStep` and every step after it skipped.
    private skipRemaining(pipeline: PipelineState, firstStep: PipelineStepSummary): void {
        for (let i = pipeline.steps.indexOf(firstStep); i < pipeline.steps.length; i++) {
            pipeline.steps[i].status = 'skipped'
        }
    }

    // Pause applies to script-started pipelines only (same as at start); an elapsed resumeAt auto-resumes.
    private async isAutoRunPaused(source?: string): Promise<boolean> {
        try {
            await this.assertAutoRunNotPaused(source)
            return false
        } catch (error) {
            if (parseServiceError(error).code === 'CI_AUTORUN_PAUSED') return true
            // Unreadable setting: carry on as not paused; the step's own pause check decides.
            Logger.error('Could not read the CI auto-run pause between steps', error)
            return false
        }
    }

    private finish(
        pipeline: PipelineState,
        status: PipelineFinishStatus,
        stopReason?: StopReason
    ): void {
        if (pipeline.status !== 'running') return
        // A Stop in progress ends the pipeline itself (as 'cancelled', after cleanup).
        if (status !== 'cancelled' && this.shouldHalt(pipeline)) return

        pipeline.status = status
        this.clearWatchdog()
        this.rememberFinished(pipeline)
        try {
            this.websocketService.broadcastPipelineCompleted(
                pipeline.pipelineRunId,
                status,
                pipeline.steps
            )
        } catch (error) {
            // The Slack message, marker clear and queue drain must not depend on the UI broadcast.
            Logger.error('Pipeline completion broadcast failed', error)
        }
        this.startGenerations.delete(pipeline.pipelineRunId)
        this.pipelineLoops.delete(pipeline.pipelineRunId)
        this.finalize(pipeline, status, stopReason).catch((error) =>
            Logger.error('Pipeline finalization failed', error)
        )
    }

    private rememberFinished(pipeline: PipelineState): void {
        this.finishedPipelines.set(pipeline.pipelineRunId, pipeline)
        if (this.finishedPipelines.size > FINISHED_PIPELINES_KEPT) {
            const oldest = this.finishedPipelines.keys().next().value
            if (oldest !== undefined) this.finishedPipelines.delete(oldest)
        }
    }

    private async finalize(
        pipeline: PipelineState,
        status: PipelineFinishStatus,
        stopReason?: StopReason
    ): Promise<void> {
        const timedOut = this.timedOutPipelineRunIds.delete(pipeline.pipelineRunId)
        if (pipeline.notify) {
            if (status === 'cancelled') {
                this.notifyCancelled(pipeline, stopReason)
            } else if (!timedOut) {
                this.ciNotifier
                    .notifyResult(pipeline.pipeline, status, pipeline.steps)
                    .catch((error) => Logger.error('Result notification failed', error))
            }
        }

        // Cleared before the drain: the next pipeline writes its own marker on start.
        try {
            await this.settingsService.clearInFlightPipeline()
        } catch (error) {
            Logger.error('Failed to clear the in-flight pipeline marker', error)
        }

        this.ciRunQueue.requestDrain()
    }

    private async persistMarker(pipeline: PipelineState): Promise<void> {
        try {
            await this.settingsService.setInFlightPipeline({
                pipeline: pipeline.pipeline,
                source: pipeline.source ?? null,
                notify: pipeline.notify,
                startedAt: pipeline.startedAt,
                runIds: pipeline.steps.flatMap((s) => (s.runId ? [s.runId] : [])),
                projects: pipeline.steps.map((s) => s.project),
                pgids: runProcessRegistry.getPgids(),
                writtenAt: new Date().toISOString(),
            })
        } catch (error) {
            Logger.error('Failed to persist the in-flight pipeline marker', error)
        }
    }

    // Posts the timeout once, then stops the pipeline (reason timeout) so a hung Playwright frees the dashboard.
    private startWatchdog(pipeline: PipelineState): void {
        if (!pipeline.notify) return

        const timeoutMs = config.ci.pipelineTimeoutMinutes * 60 * 1000
        this.watchdog = setTimeout(() => {
            const running = this.getPipeline(pipeline.pipelineRunId)
            if (!running || running.status !== 'running') return

            Logger.warn(
                `CI pipeline "${running.pipeline}" exceeded ${config.ci.pipelineTimeoutMinutes} min`
            )
            this.timedOutPipelineRunIds.add(running.pipelineRunId)
            this.ciNotifier
                .notifyTimeout(
                    running.pipeline,
                    running.steps.map((s) => s.project)
                )
                .catch((error) => Logger.error('Timeout notification failed', error))

            this.stop('timeout').catch((error) => Logger.error('Stop after timeout failed', error))
        }, timeoutMs)
        this.watchdog.unref?.()
    }

    private clearWatchdog(): void {
        if (this.watchdog) {
            clearTimeout(this.watchdog)
            this.watchdog = null
        }
    }

    // Starts queued requests while idle; one that can no longer start (paused, emptied) is dropped with a Slack line.
    private async drainQueue(): Promise<void> {
        if (this.draining) return
        this.draining = true
        try {
            while (!this.ciRunQueue.isBusy()) {
                const next = this.ciRunQueue.takeNext()
                if (!next) return
                const requeued = await this.startQueued(next)
                if (requeued) return
            }
        } finally {
            this.draining = false
        }
    }

    // Returns true when the request went back into its slot (something else started first).
    private async startQueued(request: QueuedPipelineRequest): Promise<boolean> {
        try {
            await this.startPipeline(request.maxWorkers, 'script', request.pipeline, {
                notify: true,
            })
        } catch (error) {
            const {code, message} = parseServiceError(error)
            if (code === 'TESTS_ALREADY_RUNNING') {
                this.ciRunQueue.requeue(request)
                return true
            }
            if (code === 'CI_AUTORUN_PAUSED') {
                await this.ciNotifier.notifyPaused(request.pipeline, message)
            } else if (code === 'PIPELINE_EMPTY') {
                await this.ciNotifier.notifyNotStarted(request.pipeline, 'pipeline_empty', message)
            } else {
                Logger.error(`Queued "${request.pipeline}" pipeline failed to start`, error)
                await this.ciNotifier.notifyNotStarted(request.pipeline, 'trigger_failed', message)
            }
        }
        return false
    }

    private async assertAutoRunNotPaused(source?: string): Promise<void> {
        if (source !== 'script') return

        const pause = await this.settingsService.getCIAutoRunPause()
        if (!pause.paused) return

        if (pause.resumeAt && new Date(pause.resumeAt) <= new Date()) {
            await this.settingsService.setCIAutoRunPause(false)
            return
        }

        throw new Error(
            JSON.stringify({
                code: 'CI_AUTORUN_PAUSED',
                message: 'CI auto-run is paused',
                resumeAt: pause.resumeAt,
            })
        )
    }

    private async assertPipelineNotEmpty(pipelineName: CIPipelineName): Promise<void> {
        const steps = await this.settingsService.getPipelineSteps(pipelineName)
        if (steps.length === 0) {
            throw this.createPipelineEmptyError(pipelineName)
        }
    }

    private createPipelineEmptyError(pipelineName: CIPipelineName): Error {
        return new Error(
            JSON.stringify({
                code: 'PIPELINE_EMPTY',
                message: `No project tabs are configured to run in the "${pipelineName}" pipeline`,
            })
        )
    }

    private createAlreadyRunningError(): Error {
        const currentRun = activeProcessesTracker.getActiveProcesses()[0]
        // Between pipeline steps nothing is tracked — point at the running pipeline's active step.
        const activeStepRunId = this.currentPipeline?.steps.find(
            (s) => s.status === 'running'
        )?.runId
        return new Error(
            JSON.stringify({
                code: 'TESTS_ALREADY_RUNNING',
                message: 'Tests are already running',
                currentRunId: currentRun?.id ?? activeStepRunId,
                startedAt: currentRun?.startedAt ?? this.currentPipeline?.startedAt,
            })
        )
    }
}

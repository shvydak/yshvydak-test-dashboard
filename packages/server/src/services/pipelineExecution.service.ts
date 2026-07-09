import {v4 as uuidv4} from 'uuid'
import {TestService} from './test.service'
import {SettingsService} from './settings.service'
import {RunRepository} from '../repositories/run.repository'
import {WebSocketService, PipelineStepSummary} from './websocket.service'
import {activeProcessesTracker} from './activeProcesses.service'
import {Logger} from '../utils/logger.util'

export type PipelineStatus = 'running' | 'completed' | 'stopped_early'

export interface PipelineState {
    pipelineRunId: string
    status: PipelineStatus
    steps: PipelineStepSummary[]
    startedAt: string
}

export class PipelineExecutionService {
    private currentPipeline: PipelineState | null = null

    constructor(
        private testService: TestService,
        private settingsService: SettingsService,
        private runRepository: RunRepository,
        private websocketService: WebSocketService
    ) {}

    getPipeline(pipelineRunId: string): PipelineState | null {
        if (this.currentPipeline?.pipelineRunId === pipelineRunId) {
            return this.currentPipeline
        }
        return null
    }

    getCurrentPipeline(): PipelineState | null {
        return this.currentPipeline
    }

    /**
     * Kicks off the pipeline and returns its initial state immediately — the
     * steps themselves run sequentially in the background (same fire-and-forget
     * shape as the existing single-project run-all endpoint).
     */
    async startPipeline(maxWorkers?: number, source?: string): Promise<PipelineState> {
        // Same guard checks TestService.runAllTests performs, done once here so
        // the caller gets a synchronous 409/423 instead of it surfacing mid-chain.
        if (source === 'script') {
            const pause = await this.settingsService.getCIAutoRunPause()
            if (pause.paused) {
                if (pause.resumeAt && new Date(pause.resumeAt) <= new Date()) {
                    await this.settingsService.setCIAutoRunPause(false)
                } else {
                    throw new Error(
                        JSON.stringify({
                            code: 'CI_AUTORUN_PAUSED',
                            message: 'CI auto-run is paused',
                            resumeAt: pause.resumeAt,
                        })
                    )
                }
            }
        }

        if (activeProcessesTracker.isAnyProcessRunning()) {
            const activeRuns = activeProcessesTracker.getActiveProcesses()
            const currentRun = activeRuns[0]
            throw new Error(
                JSON.stringify({
                    code: 'TESTS_ALREADY_RUNNING',
                    message: 'Tests are already running',
                    currentRunId: currentRun?.id,
                    startedAt: currentRun?.startedAt,
                })
            )
        }

        const configuredSteps = await this.settingsService.getPipelineSteps()
        if (configuredSteps.length === 0) {
            throw new Error(
                JSON.stringify({
                    code: 'PIPELINE_EMPTY',
                    message: 'No project tabs are configured to run in the CI pipeline',
                })
            )
        }

        const pipelineRunId = uuidv4()
        const steps: PipelineStepSummary[] = configuredSteps.map((s) => ({
            project: s.project,
            displayName: s.displayName,
            stopOnFailure: s.stopPipelineOnFailure,
            status: 'queued',
        }))

        this.currentPipeline = {
            pipelineRunId,
            status: 'running',
            steps,
            startedAt: new Date().toISOString(),
        }

        this.websocketService.broadcastPipelineStarted(pipelineRunId, steps)

        this.runSteps(pipelineRunId, maxWorkers, source).catch((error) => {
            Logger.error('Pipeline execution failed unexpectedly', error)
            const pipeline = this.getPipeline(pipelineRunId)
            if (pipeline) {
                this.finish(pipeline, 'stopped_early')
            }
        })

        return this.currentPipeline
    }

    private async runSteps(
        pipelineRunId: string,
        maxWorkers?: number,
        source?: string
    ): Promise<void> {
        const pipeline = this.getPipeline(pipelineRunId)
        if (!pipeline) return

        for (const step of pipeline.steps) {
            step.status = 'running'

            let result: any
            try {
                result = await this.testService.runAllTests(maxWorkers, false, step.project, source)
            } catch (error) {
                Logger.error(`Pipeline step failed to start: ${step.project}`, error)
                step.status = 'failed'
                this.websocketService.broadcastPipelineStepCompleted(pipelineRunId, step)
                this.stopRemaining(pipeline, step)
                this.finish(pipeline, 'stopped_early')
                return
            }

            step.runId = result.runId
            this.websocketService.broadcastPipelineStepStarted(
                pipelineRunId,
                step.project,
                result.runId
            )

            await this.waitForProcessClose(result.process)

            const run = await this.runRepository.getTestRun(result.runId)
            const passed = run?.passedTests ?? 0
            const failed = run?.failedTests ?? 0

            step.passed = passed
            step.failed = failed
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
        process: {once: (event: 'close', listener: () => void) => void} | undefined
    ): Promise<void> {
        return new Promise((resolve) => {
            if (!process) {
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

    private finish(pipeline: PipelineState, status: 'completed' | 'stopped_early'): void {
        pipeline.status = status
        this.websocketService.broadcastPipelineCompleted(
            pipeline.pipelineRunId,
            status,
            pipeline.steps
        )
    }
}

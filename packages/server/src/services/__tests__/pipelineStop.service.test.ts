import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {EventEmitter} from 'events'
import {PipelineExecutionService} from '../pipelineExecution.service'
import {CIRunQueueService} from '../ciRunQueue.service'
import {runProcessRegistry} from '../runProcessRegistry.service'
import {createRunCancelledError} from '../../utils/runStop.util'
import {Logger} from '../../utils/logger.util'

vi.mock('../../utils/logger.util', () => ({
    Logger: {info: vi.fn(), error: vi.fn(), warn: vi.fn()},
}))

vi.mock('../../utils/processGroup.util', () => ({
    signalGroup: vi.fn(),
    killLeftoverPlaywrightGroups: vi.fn().mockResolvedValue([]),
}))

vi.mock('../activeProcesses.service', () => ({
    activeProcessesTracker: {
        isProcessRunning: vi.fn(() => false),
        removeProcess: vi.fn(),
        getActiveProcesses: vi.fn(() => []),
    },
}))

import {activeProcessesTracker} from '../activeProcesses.service'
import {killLeftoverPlaywrightGroups} from '../../utils/processGroup.util'

// What the DB recount gives for a run that was cut: 2 tests kept, 1 of them failed.
const KEPT = {total: 2, passed: 1, failed: 1, skipped: 0}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve))

function deferred<T = void>() {
    let resolve!: (value: T) => void
    let reject!: (error: unknown) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return {promise, resolve, reject}
}

// A fake Playwright child: it dies when signalled (SIGINT unless told to ignore it).
function createChild(options: {ignoreSigint?: boolean; neverClose?: boolean} = {}) {
    const child: any = new EventEmitter()
    child.pid = undefined
    child.exitCode = null
    child.signalCode = null
    child.kill = vi.fn((signal: string) => {
        if (options.neverClose) return true
        if (options.ignoreSigint && signal === 'SIGINT') return true
        setImmediate(() => child.emit('close', null, signal))
        return true
    })
    return child
}

describe('Stop (PipelineExecutionService)', () => {
    let service: PipelineExecutionService
    let queue: CIRunQueueService
    let testService: any
    let settings: any
    let runRepository: any
    let websocket: any
    let notifier: any
    let children: any[]

    const tab = (project: string, extra: Record<string, unknown> = {}) => ({
        project,
        displayName: `${project} tab`,
        stopPipelineOnFailure: false,
        ...extra,
    })

    function stubPipelines(byName: Record<string, any[]>) {
        settings.getPipelineSteps.mockImplementation(async (name: string) => byName[name] ?? [])
    }

    // Like TestService.runAllTests: every spawn is registered in the run registry.
    function stubRuns(childOptions: {ignoreSigint?: boolean; neverClose?: boolean} = {}) {
        testService.runAllTests.mockImplementation(
            async (_workers: unknown, _skip: unknown, project: string) => {
                const child = createChild(childOptions)
                children.push(child)
                const runId = `run-${children.length}`
                runProcessRegistry.register({runId, type: 'run-all', project}, child)
                return {runId, process: child}
            }
        )
    }

    const runOk = (passed = 1, failed = 0) => ({
        status: 'completed',
        passedTests: passed,
        failedTests: failed,
    })

    // The late-post grace period of a stop runs on a faked clock.
    const finishStop = async (stopped: Promise<unknown>) => {
        await flushPromises()
        await vi.advanceTimersByTimeAsync(1_000)
        return stopped
    }

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(killLeftoverPlaywrightGroups).mockResolvedValue([])
        vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
        children = []
        // The registry is a singleton and tests reuse run ids: forget earlier tests' stop flags.
        ;(runProcessRegistry as any).cancelled.clear()
        ;(runProcessRegistry as any).stopping.clear()

        testService = {
            runAllTests: vi.fn(),
            discardRuns: vi.fn().mockResolvedValue(undefined),
            discardDiscoveryRows: vi.fn().mockResolvedValue(undefined),
            finalizeStoppedRuns: vi.fn(
                async (ids: string[]) => new Map(ids.map((id) => [id, KEPT]))
            ),
            clearRunMarker: vi.fn().mockResolvedValue(undefined),
        }
        settings = {
            getCIAutoRunPause: vi.fn().mockResolvedValue({paused: false, resumeAt: null}),
            setCIAutoRunPause: vi.fn(),
            getPipelineSteps: vi.fn().mockResolvedValue([]),
            getInFlightPipeline: vi.fn().mockResolvedValue(null),
            getInFlightRun: vi.fn().mockResolvedValue(null),
            setInFlightPipeline: vi.fn().mockResolvedValue(undefined),
            clearInFlightPipeline: vi.fn().mockResolvedValue(undefined),
            clearInFlightRun: vi.fn().mockResolvedValue(undefined),
        }
        runRepository = {getTestRun: vi.fn().mockResolvedValue(runOk())}
        websocket = {
            broadcastPipelineStarted: vi.fn(),
            broadcastPipelineStepStarted: vi.fn(),
            broadcastPipelineStepCompleted: vi.fn(),
            broadcastPipelineCompleted: vi.fn(),
            broadcastPipelineQueueChanged: vi.fn(),
            broadcastRunStopping: vi.fn(),
            broadcastRunCancelled: vi.fn(),
        }
        notifier = {
            notifyResult: vi.fn().mockResolvedValue(undefined),
            notifyTimeout: vi.fn().mockResolvedValue(undefined),
            notifyInterrupted: vi.fn().mockResolvedValue(undefined),
            notifyPaused: vi.fn().mockResolvedValue(undefined),
            notifyNotStarted: vi.fn().mockResolvedValue(undefined),
            notifyStopped: vi.fn().mockResolvedValue(undefined),
            notifyTimeLimitStop: vi.fn().mockResolvedValue(undefined),
            notifyReplaced: vi.fn().mockResolvedValue(undefined),
        }

        queue = new CIRunQueueService(websocket)
        service = new PipelineExecutionService(
            testService,
            settings,
            runRepository,
            websocket,
            queue,
            notifier
        )
        stubPipelines({develop: [tab('API'), tab('WEB')], production: [tab('Smoke')]})
    })

    afterEach(async () => {
        // Closing step N lets the pipeline spawn step N+1: keep closing until nothing new appears.
        vi.useRealTimers()
        for (let i = 0; i < 5; i++) {
            children.forEach((child) => child.emit('close', 0))
            await flushPromises()
        }
        delete process.env.CI_PIPELINE_TIMEOUT_MINUTES
        vi.restoreAllMocks()
    })

    describe('keep mode (manual stop) mid-step', () => {
        it('signals the child, waits for it to close, finalizes the run (kept), and ends the pipeline cancelled with the results kept', async () => {
            stubRuns()
            const pipeline = await service.startPipeline(undefined, 'script', 'develop', {
                notify: true,
            })
            await flushPromises()

            const stopped = service.stop('manual')

            // Flags and signal first; nothing is rewritten while the child may still be writing.
            expect(children[0].kill).toHaveBeenCalledWith('SIGINT')
            expect(websocket.broadcastRunStopping).toHaveBeenCalledWith('manual', true)
            expect(runProcessRegistry.isStopping('run-1')).toBe(true)
            expect(runProcessRegistry.isCancelled('run-1')).toBe(false)
            expect(queue.isBusy()).toBe(true)
            expect(testService.finalizeStoppedRuns).not.toHaveBeenCalled()

            const outcome = await finishStop(stopped)

            expect(outcome).toEqual({
                stopped: true,
                reason: 'manual',
                pipelineRunId: pipeline.pipelineRunId,
                runIds: ['run-1'],
                resultsKept: true,
            })
            // The second step never spawned.
            expect(testService.runAllTests).toHaveBeenCalledTimes(1)
            expect(testService.discardRuns).not.toHaveBeenCalled()
            expect(testService.finalizeStoppedRuns).toHaveBeenCalledWith(['run-1'], {
                reason: 'manual',
                at: expect.any(String),
            })
            const ended = service.getPipeline(pipeline.pipelineRunId)
            expect(ended).toMatchObject({
                status: 'cancelled',
                stopReason: 'manual',
                resultsKept: true,
            })
            expect(ended?.timeLimitMinutes).toBeUndefined()
            // The pipeline's name rides on pipeline:started: the web's Stop dialog names it.
            expect(websocket.broadcastPipelineStarted).toHaveBeenCalledWith(
                pipeline.pipelineRunId,
                expect.any(Array),
                'develop'
            )
            expect(ended?.steps.map((s) => s.status)).toEqual(['stopped', 'skipped'])
            // The stopped step keeps its run id and the recounted numbers.
            expect(ended?.steps[0]).toMatchObject({runId: 'run-1', passed: 1, failed: 1})
            expect(runProcessRegistry.isCancelled('run-1')).toBe(true)
            expect(websocket.broadcastPipelineCompleted).toHaveBeenCalledWith(
                pipeline.pipelineRunId,
                'cancelled',
                expect.any(Array)
            )
            expect(websocket.broadcastRunCancelled).toHaveBeenCalledWith(
                ['run-1'],
                'manual',
                pipeline.pipelineRunId,
                true,
                ended?.stoppedAt
            )
            expect(ended?.stoppedAt).toEqual(expect.any(String))
            expect(queue.isBusy()).toBe(false)
        })

        it('keeps the placeholder cleanup scopes of every step and clears both markers right after the finalize, before the Slack post', async () => {
            stubRuns()
            const pipeline = await service.startPipeline(undefined, 'script', 'develop', {
                notify: true,
            })
            await flushPromises()

            await finishStop(service.stop('manual'))

            expect(testService.discardDiscoveryRows).toHaveBeenCalledWith([
                {project: 'API', since: pipeline.startedAt},
                {project: 'WEB', since: pipeline.startedAt},
            ])
            const order = (fn: any) => fn.mock.invocationCallOrder[0]
            expect(order(testService.finalizeStoppedRuns)).toBeLessThan(
                order(testService.clearRunMarker)
            )
            expect(order(testService.clearRunMarker)).toBeLessThan(order(notifier.notifyStopped))
            expect(order(settings.clearInFlightPipeline)).toBeLessThan(
                order(notifier.notifyStopped)
            )
        })

        it('does not read the cut step as a crash: no stopped_early, no "Stopped at" message', async () => {
            // The killed child never finished its run row; without the stop this is a crash (stopped_early).
            runRepository.getTestRun.mockResolvedValue({
                status: 'running',
                passedTests: 0,
                failedTests: 0,
            })
            stubRuns()
            const pipeline = await service.startPipeline(undefined, 'script', 'develop', {
                notify: true,
            })
            await flushPromises()

            await finishStop(service.stop('manual'))

            expect(service.getPipeline(pipeline.pipelineRunId)?.status).toBe('cancelled')
            expect(notifier.notifyResult).not.toHaveBeenCalled()
        })

        it('leaves no ghost entry in the progress tracker', async () => {
            stubRuns()
            await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()
            vi.mocked(activeProcessesTracker.isProcessRunning).mockReturnValue(true)

            await finishStop(service.stop('manual'))

            expect(activeProcessesTracker.removeProcess).toHaveBeenCalledWith('run-1')
        })

        it('close handlers see the run as settled from the signal on (stopping), reporter posts stay accepted', async () => {
            stubRuns()
            await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()

            const stopped = service.stop('manual')
            expect(runProcessRegistry.isStopping('run-1')).toBe(true)
            expect(runProcessRegistry.isCancelled('run-1')).toBe(false)
            expect(typeof runProcessRegistry.getStopSignalledAt('run-1')).toBe('number')
            await finishStop(stopped)
        })

        it('escalates to SIGKILL for a child that ignores SIGINT, then still finalizes', async () => {
            stubRuns({ignoreSigint: true})
            await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()

            const stopped = service.stop('manual')
            await vi.advanceTimersByTimeAsync(19_000)
            expect(children[0].kill).not.toHaveBeenCalledWith('SIGKILL')

            await vi.advanceTimersByTimeAsync(1_500)
            expect(children[0].kill).toHaveBeenCalledWith('SIGKILL')

            await finishStop(stopped)
            expect(testService.finalizeStoppedRuns).toHaveBeenCalledWith(
                ['run-1'],
                expect.any(Object)
            )
        })
    })

    describe('finished steps are never rewritten (keep mode)', () => {
        it('stopping during step 2 finalizes only step 2; step 1 stays as it ended', async () => {
            stubRuns()
            const pipeline = await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()
            children[0].emit('close', 0)
            await flushPromises()
            expect(service.getPipeline(pipeline.pipelineRunId)?.steps[0].status).toBe('success')
            expect(children).toHaveLength(2)

            await finishStop(service.stop('manual'))

            expect(testService.finalizeStoppedRuns).toHaveBeenCalledWith(
                ['run-2'],
                expect.any(Object)
            )
            expect(testService.discardRuns).not.toHaveBeenCalled()
            const steps = service.getPipeline(pipeline.pipelineRunId)?.steps
            expect(steps?.map((s) => s.status)).toEqual(['success', 'stopped'])
            // Step 1 keeps its run id and the counts it ended with (the run row mock: 1 passed, 0 failed).
            expect(steps?.[0]).toMatchObject({runId: 'run-1', passed: 1, failed: 0})
            expect(steps?.[1]).toMatchObject({runId: 'run-2', passed: 1, failed: 1})
        })

        it('a failed finished step stays failed', async () => {
            runRepository.getTestRun.mockResolvedValueOnce(runOk(1, 2))
            stubRuns()
            const pipeline = await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()
            children[0].emit('close', 0)
            await flushPromises()

            await finishStop(service.stop('manual'))

            const steps = service.getPipeline(pipeline.pipelineRunId)?.steps
            expect(steps?.map((s) => s.status)).toEqual(['failed', 'stopped'])
            expect(steps?.[0]).toMatchObject({passed: 1, failed: 2})
        })

        it('a running step whose child closed on its own just before the signal: finalized only when its row still says running', async () => {
            // The child closed (so it is not in the registry), but the loop has not read the row yet.
            stubRuns()
            const pipeline = await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()
            const step = service.getPipeline(pipeline.pipelineRunId)!.steps[0]
            runRepository.getTestRun.mockResolvedValue(runOk(3, 0))
            // Simulate: registry no longer holds the run, step still `running` (the loop gives up on the child after 5 s).
            ;(runProcessRegistry as any).runs.delete('run-1')

            const stopped = service.stop('manual')
            await flushPromises()
            await vi.advanceTimersByTimeAsync(7_000)
            await stopped

            expect(testService.finalizeStoppedRuns).toHaveBeenCalledWith([], expect.any(Object))
            expect(step.status).toBe('success')
            expect(step).toMatchObject({passed: 3, failed: 0})
        })
    })

    describe('discard mode (replaced by a newer deploy)', () => {
        it('deletes the run, the discovery rows of every step since the pipeline began, and clears the manual-run marker; steps read as never run', async () => {
            stubRuns()
            const pipeline = await service.startPipeline(undefined, 'script', 'develop', {
                notify: true,
            })
            await flushPromises()
            children[0].emit('close', 0)
            await flushPromises()

            const stopped = service.stop('replaced')
            expect(websocket.broadcastRunStopping).toHaveBeenCalledWith('replaced', false)
            expect(runProcessRegistry.isCancelled('run-2')).toBe(true)
            const outcome = await finishStop(stopped)

            expect(outcome).toMatchObject({stopped: true, reason: 'replaced', resultsKept: false})
            // Finished steps go too (a replaced run counts as never run).
            expect(testService.discardRuns).toHaveBeenCalledWith(
                ['run-1', 'run-2'],
                [
                    {project: 'API', since: pipeline.startedAt},
                    {project: 'WEB', since: pipeline.startedAt},
                ]
            )
            expect(testService.finalizeStoppedRuns).not.toHaveBeenCalled()
            expect(testService.clearRunMarker).toHaveBeenCalled()
            const ended = service.getPipeline(pipeline.pipelineRunId)
            expect(ended).toMatchObject({
                status: 'cancelled',
                stopReason: 'replaced',
                resultsKept: false,
            })
            expect(ended?.steps.map((s) => s.status)).toEqual(['skipped', 'skipped'])
            expect(ended?.steps.every((s) => s.runId === undefined && s.passed === undefined)).toBe(
                true
            )
            expect(websocket.broadcastRunCancelled).toHaveBeenCalledWith(
                ['run-1', 'run-2'],
                'replaced',
                pipeline.pipelineRunId,
                false,
                undefined
            )
            expect(ended?.stoppedAt).toBeUndefined()
        })
    })

    describe('stopping before a child exists', () => {
        it('between steps: step 2 is still in discovery, so it never spawns and step 1 stays as it ended', async () => {
            stubPipelines({develop: [tab('API'), tab('WEB')]})
            const step2Discovery = deferred()
            testService.runAllTests
                .mockImplementationOnce(async (_w: unknown, _s: unknown, project: string) => {
                    const child = createChild()
                    children.push(child)
                    runProcessRegistry.register({runId: 'run-1', type: 'run-all', project}, child)
                    return {runId: 'run-1', process: child}
                })
                .mockImplementationOnce(async () => {
                    // TestService holds a starting claim while it discovers, then notices the Stop.
                    const release = queue.beginStarting()
                    try {
                        await step2Discovery.promise
                        throw createRunCancelledError()
                    } finally {
                        release()
                    }
                })
            const pipeline = await service.startPipeline(undefined, 'script', 'develop', {
                notify: true,
            })
            await flushPromises()
            children[0].emit('close', 0)
            await flushPromises()

            const stopped = service.stop('manual')
            await flushPromises()
            await vi.advanceTimersByTimeAsync(5_000)
            let done = false
            stopped.then(() => (done = true))
            await flushPromises()
            // Waits for the start in discovery to unwind before it touches anything.
            expect(done).toBe(false)
            expect(testService.finalizeStoppedRuns).not.toHaveBeenCalled()

            step2Discovery.resolve()
            await finishStop(stopped)

            expect(testService.runAllTests).toHaveBeenCalledTimes(2)
            expect(children).toHaveLength(1)
            // Nothing was live: no run is rewritten, step 1 keeps its ending.
            expect(testService.finalizeStoppedRuns).toHaveBeenCalledWith([], expect.any(Object))
            expect(testService.discardRuns).not.toHaveBeenCalled()
            const ended = service.getPipeline(pipeline.pipelineRunId)
            expect(ended?.status).toBe('cancelled')
            expect(ended?.steps.map((s) => s.status)).toEqual(['success', 'skipped'])
            expect(notifier.notifyStopped).toHaveBeenCalledTimes(1)
            expect(notifier.notifyResult).not.toHaveBeenCalled()
        })

        it('during discovery of the first step: nothing to signal, nothing spawns, pipeline cancelled', async () => {
            const discovery = deferred()
            testService.runAllTests.mockImplementation(async () => {
                const release = queue.beginStarting()
                try {
                    await discovery.promise
                    throw createRunCancelledError()
                } finally {
                    release()
                }
            })
            const pipeline = await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()

            const stopped = service.stop('manual')
            discovery.resolve()
            const outcome: any = await finishStop(stopped)

            expect(outcome.stopped).toBe(true)
            expect(outcome.runIds).toEqual([])
            expect(testService.discardDiscoveryRows).toHaveBeenCalledWith(
                expect.arrayContaining([{project: 'API', since: pipeline.startedAt}])
            )
            expect(service.getPipeline(pipeline.pipelineRunId)?.status).toBe('cancelled')
            expect(service.getPipeline(pipeline.pipelineRunId)?.steps.map((s) => s.status)).toEqual(
                ['skipped', 'skipped']
            )
        })

        it('while the pipeline is still starting (tab list being read): the first step never runs', async () => {
            const tabs = deferred<any[]>()
            settings.getPipelineSteps.mockReturnValueOnce(tabs.promise)
            stubRuns()
            const started = service.startPipeline(undefined, 'script', 'develop', {notify: true})
            await flushPromises()

            const stopped = service.stop('manual')
            tabs.resolve([tab('API'), tab('WEB')])
            const pipeline = await started
            await finishStop(stopped)

            expect(testService.runAllTests).not.toHaveBeenCalled()
            expect(service.getPipeline(pipeline.pipelineRunId)?.status).toBe('cancelled')
            expect(notifier.notifyStopped).toHaveBeenCalledTimes(1)
        })

        it('a step whose start is refused for any reason after a stop is not read as a failed step', async () => {
            testService.runAllTests.mockImplementation(async () => {
                throw new Error(
                    JSON.stringify({
                        code: 'TESTS_ALREADY_RUNNING',
                        message: 'Tests are already running',
                    })
                )
            })
            const pipeline = await service.startPipeline(undefined, 'script', 'develop', {
                notify: true,
            })
            // Stop lands right after the pipeline began, before its first step reports the failure.
            const stopped = service.stop('manual')
            await finishStop(stopped)

            expect(service.getPipeline(pipeline.pipelineRunId)?.status).toBe('cancelled')
            expect(notifier.notifyResult).not.toHaveBeenCalled()
        })
    })

    describe('a failed cleanup', () => {
        it('keep mode: a failed finalize still ends the pipeline cancelled, frees the dashboard, logs loudly, and rejects (HTTP 500)', async () => {
            stubRuns()
            testService.finalizeStoppedRuns.mockRejectedValue(new Error('database is locked'))
            const pipeline = await service.startPipeline(undefined, 'script', 'develop', {
                notify: true,
            })
            await flushPromises()

            const stopped = service.stop('manual')
            const rejection = expect(stopped).rejects.toThrow('database is locked')
            await finishStop(stopped.catch(() => undefined))
            await rejection

            expect(service.getPipeline(pipeline.pipelineRunId)?.status).toBe('cancelled')
            expect(queue.isBusy()).toBe(false)
            expect(service.isStopping()).toBe(false)
            // The text must be true: a second Stop finds nothing running, so the log names the run ids.
            expect(Logger.error).toHaveBeenCalledWith(
                expect.stringMatching(/STOP CLEANUP FAILED.*run-1/),
                expect.any(Error)
            )
            testService.finalizeStoppedRuns.mockClear()
            expect(await service.stop('manual')).toEqual({stopped: false, runIds: []})
            expect(testService.finalizeStoppedRuns).not.toHaveBeenCalled()
            expect(websocket.broadcastRunCancelled).toHaveBeenCalled()
            expect(settings.clearInFlightPipeline).toHaveBeenCalled()
        })

        it('discard mode: a failed delete still ends the pipeline and names the run ids to delete by hand', async () => {
            stubRuns()
            testService.discardRuns.mockRejectedValue(new Error('database is locked'))
            const pipeline = await service.startPipeline(undefined, 'script', 'develop', {
                notify: true,
            })
            await flushPromises()

            const stopped = service.stop('replaced')
            const rejection = expect(stopped).rejects.toThrow('database is locked')
            await finishStop(stopped.catch(() => undefined))
            await rejection

            expect(service.getPipeline(pipeline.pipelineRunId)?.status).toBe('cancelled')
            expect(queue.isBusy()).toBe(false)
            expect(Logger.error).toHaveBeenCalledWith(
                expect.stringMatching(/STOP CLEANUP FAILED.*delete them by hand.*run-1/),
                expect.any(Error)
            )
        })

        it('a new run can start right after a failed stop', async () => {
            stubRuns()
            testService.finalizeStoppedRuns.mockRejectedValueOnce(new Error('disk full'))
            await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()
            const stopped = service.stop('manual')
            stopped.catch(() => undefined)
            await finishStop(stopped.catch(() => undefined))

            const next = await service.startPipeline(undefined, 'script', 'develop')

            expect(next.status).toBe('running')
        })
    })

    describe('a Stop that finishes inside the first await of startPipeline', () => {
        it('does not leave the new pipeline halted with nobody to end it', async () => {
            const pause = deferred<{paused: boolean; resumeAt: null}>()
            settings.getCIAutoRunPause.mockReturnValueOnce(pause.promise)
            stubRuns()

            const starting = service.startPipeline(undefined, 'script', 'develop')
            // While the pause setting is being read, another start claims the dashboard and a Stop runs to the end.
            const claim = queue.beginStarting()
            const stopped = service.stop('manual')
            claim()
            await finishStop(stopped)
            expect((await stopped).stopped).toBe(true)

            pause.resolve({paused: false, resumeAt: null})
            const pipeline = await starting
            await flushPromises()

            expect(pipeline.status).toBe('running')
            expect(testService.runAllTests).toHaveBeenCalledTimes(1)
        })
    })

    describe('stopping with nothing running', () => {
        it('answers stopped:false and touches nothing', async () => {
            const outcome = await service.stop('manual')

            expect(outcome).toEqual({stopped: false, runIds: []})
            expect(websocket.broadcastRunStopping).not.toHaveBeenCalled()
            expect(testService.finalizeStoppedRuns).not.toHaveBeenCalled()
            expect(testService.discardRuns).not.toHaveBeenCalled()
            expect(notifier.notifyStopped).not.toHaveBeenCalled()
            expect(queue.isBusy()).toBe(false)
        })

        it('does not poison a run that starts afterwards', async () => {
            await service.stop('manual')
            stubRuns()

            const pipeline = await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()

            expect(testService.runAllTests).toHaveBeenCalledTimes(1)
            expect(pipeline.status).toBe('running')
        })
    })

    describe('a second stop while one is running', () => {
        it('joins the first one: one signal, one finalize', async () => {
            stubRuns()
            await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()

            const first = service.stop('manual')
            const second = service.stop('manual')
            await finishStop(first)

            expect(await second).toEqual(await first)
            expect(children[0].kill).toHaveBeenCalledTimes(1)
            expect(testService.finalizeStoppedRuns).toHaveBeenCalledTimes(1)
            expect(service.isStopping()).toBe(false)
        })

        it('reports isStopping() while the cleanup runs', async () => {
            stubRuns()
            await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()

            const stopped = service.stop('manual')
            expect(service.isStopping()).toBe(true)
            await finishStop(stopped)
            expect(service.isStopping()).toBe(false)
        })
    })

    describe('Slack per reason (only when the request asked for it)', () => {
        const runStopped = async (reason: any, notify: boolean) => {
            stubRuns()
            await service.startPipeline(undefined, 'script', 'develop', {notify})
            await flushPromises()
            await finishStop(service.stop(reason))
        }

        it('manual -> "Stopped manually, results kept", with the kept counts of the steps', async () => {
            await runStopped('manual', true)

            expect(notifier.notifyStopped).toHaveBeenCalledTimes(1)
            expect(notifier.notifyStopped).toHaveBeenCalledWith('develop', [
                expect.objectContaining({project: 'API', status: 'stopped', failed: 1}),
                expect.objectContaining({project: 'WEB', status: 'skipped'}),
            ])
            expect(notifier.notifyReplaced).not.toHaveBeenCalled()
            expect(notifier.notifyResult).not.toHaveBeenCalled()
        })

        it('replaced -> "Cancelled by a newer deploy"', async () => {
            await runStopped('replaced', true)

            expect(notifier.notifyReplaced).toHaveBeenCalledWith('develop', ['API', 'WEB'])
            expect(notifier.notifyStopped).not.toHaveBeenCalled()
        })

        it('timeout -> one "Stopped after N min" line from the stop', async () => {
            await runStopped('timeout', true)

            expect(notifier.notifyTimeLimitStop).toHaveBeenCalledTimes(1)
            expect(notifier.notifyTimeLimitStop).toHaveBeenCalledWith(
                'develop',
                30,
                expect.any(Array)
            )
            expect(notifier.notifyStopped).not.toHaveBeenCalled()
            expect(notifier.notifyResult).not.toHaveBeenCalled()
        })

        it('restart -> no extra line from the stop (startup announces it itself)', async () => {
            await runStopped('restart', true)

            expect(notifier.notifyStopped).not.toHaveBeenCalled()
            expect(notifier.notifyTimeLimitStop).not.toHaveBeenCalled()
            expect(notifier.notifyReplaced).not.toHaveBeenCalled()
            expect(notifier.notifyResult).not.toHaveBeenCalled()
        })

        it.each(['manual', 'replaced', 'timeout', 'restart'] as const)(
            '%s without notify -> nothing is posted',
            async (reason) => {
                await runStopped(reason, false)

                expect(notifier.notifyStopped).not.toHaveBeenCalled()
                expect(notifier.notifyTimeLimitStop).not.toHaveBeenCalled()
                expect(notifier.notifyReplaced).not.toHaveBeenCalled()
                expect(notifier.notifyResult).not.toHaveBeenCalled()
                expect(notifier.notifyTimeout).not.toHaveBeenCalled()
            }
        )

        it('a failing notifier does not break the stop', async () => {
            notifier.notifyStopped.mockRejectedValue(new Error('slack down'))

            await runStopped('manual', true)

            expect(service.getCurrentPipeline()?.status).toBe('cancelled')
            expect(queue.isBusy()).toBe(false)
        })
    })

    describe('watchdog (time limit, keeps results)', () => {
        const LIMIT_MS = 30 * 60 * 1000

        it('stops the pipeline with reason timeout, keeps the results, and posts ONE line after the stop', async () => {
            stubRuns()
            const pipeline = await service.startPipeline(undefined, 'script', 'develop', {
                notify: true,
            })
            await flushPromises()

            await vi.advanceTimersByTimeAsync(LIMIT_MS)

            // Signalled, but no Slack line before the stop has ended.
            expect(children[0].kill).toHaveBeenCalledWith('SIGINT')
            expect(notifier.notifyTimeout).not.toHaveBeenCalled()
            expect(notifier.notifyTimeLimitStop).not.toHaveBeenCalled()

            await vi.advanceTimersByTimeAsync(1_000)
            await flushPromises()

            expect(service.getPipeline(pipeline.pipelineRunId)).toMatchObject({
                status: 'cancelled',
                stopReason: 'timeout',
                resultsKept: true,
                // The dashboard banner says "stopped after 30 min".
                timeLimitMinutes: 30,
            })
            expect(testService.finalizeStoppedRuns).toHaveBeenCalledWith(['run-1'], {
                reason: 'timeout',
                at: expect.any(String),
            })
            expect(testService.discardRuns).not.toHaveBeenCalled()
            expect(notifier.notifyTimeLimitStop).toHaveBeenCalledTimes(1)
            expect(notifier.notifyTimeLimitStop).toHaveBeenCalledWith(
                'develop',
                30,
                expect.any(Array)
            )
            expect(notifier.notifyTimeout).not.toHaveBeenCalled()
            expect(notifier.notifyStopped).not.toHaveBeenCalled()
            expect(notifier.notifyResult).not.toHaveBeenCalled()
        })

        it('stops a hung child that ignores SIGINT', async () => {
            stubRuns({ignoreSigint: true})
            const pipeline = await service.startPipeline(undefined, 'script', 'develop', {
                notify: true,
            })
            await flushPromises()

            await vi.advanceTimersByTimeAsync(LIMIT_MS + 21_000)
            await vi.advanceTimersByTimeAsync(1_000)
            await flushPromises()

            expect(children[0].kill).toHaveBeenCalledWith('SIGKILL')
            expect(service.getPipeline(pipeline.pipelineRunId)?.status).toBe('cancelled')
        })

        it('a child that never emits close: the stop still finishes (loop cap) and exactly one Slack line goes out', async () => {
            stubRuns({neverClose: true})
            const pipeline = await service.startPipeline(undefined, 'script', 'develop', {
                notify: true,
            })
            await flushPromises()

            // SIGINT -> 20 s -> SIGKILL -> 5 s give-up; the loop gives up 5 s later; then the late-post grace.
            await vi.advanceTimersByTimeAsync(LIMIT_MS + 20_000 + 5_000 + 5_000 + 1_000)
            await flushPromises()

            expect(children[0].kill).toHaveBeenCalledWith('SIGKILL')
            expect(service.getPipeline(pipeline.pipelineRunId)?.status).toBe('cancelled')
            expect(notifier.notifyTimeLimitStop).toHaveBeenCalledTimes(1)
            expect(notifier.notifyTimeout).not.toHaveBeenCalled()

            // The fallback timer died with the pipeline: nothing more arrives later.
            await vi.advanceTimersByTimeAsync(5 * 60_000)
            expect(notifier.notifyTimeLimitStop).toHaveBeenCalledTimes(1)
            expect(notifier.notifyTimeout).not.toHaveBeenCalled()
        })

        it('a stop that hangs past the fallback posts the old "Timed out" line once and no second message follows', async () => {
            stubRuns()
            const finalize = deferred<Map<string, typeof KEPT>>()
            testService.finalizeStoppedRuns.mockReturnValueOnce(finalize.promise)
            const pipeline = await service.startPipeline(undefined, 'script', 'develop', {
                notify: true,
            })
            await flushPromises()

            await vi.advanceTimersByTimeAsync(LIMIT_MS + 1_000)
            await flushPromises()
            expect(notifier.notifyTimeout).not.toHaveBeenCalled()
            expect(service.getPipeline(pipeline.pipelineRunId)?.status).toBe('running')

            await vi.advanceTimersByTimeAsync(60_000)
            expect(notifier.notifyTimeout).toHaveBeenCalledTimes(1)

            // The hung step ends later: the stop finishes without a second message.
            finalize.resolve(new Map([['run-1', KEPT]]))
            await flushPromises()
            await vi.advanceTimersByTimeAsync(1_000)
            await flushPromises()

            expect(service.getPipeline(pipeline.pipelineRunId)?.status).toBe('cancelled')
            expect(notifier.notifyTimeout).toHaveBeenCalledTimes(1)
            expect(notifier.notifyTimeLimitStop).not.toHaveBeenCalled()
            expect(notifier.notifyStopped).not.toHaveBeenCalled()
            expect(notifier.notifyResult).not.toHaveBeenCalled()
        })
    })

    describe('a pipeline loop the stop gave up on', () => {
        it('a late close of the cut step does not rewrite the finalized step or spawn the next one', async () => {
            stubPipelines({develop: [tab('API'), tab('WEB'), tab('SMOKE')]})
            testService.runAllTests.mockImplementation(
                async (_workers: unknown, _skip: unknown, project: string) => {
                    // The second child never emits close on its own.
                    const child = createChild({neverClose: children.length === 1})
                    children.push(child)
                    const runId = `run-${children.length}`
                    runProcessRegistry.register({runId, type: 'run-all', project}, child)
                    return {runId, process: child}
                }
            )
            const pipeline = await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()
            children[0].emit('close', 0)
            await flushPromises()
            expect(children).toHaveLength(2)

            const stopped = service.stop('manual')
            await vi.advanceTimersByTimeAsync(20_000 + 5_000 + 5_000 + 1_000)
            await stopped
            expect(service.getPipeline(pipeline.pipelineRunId)?.status).toBe('cancelled')

            // The child finally dies after the stop gave up waiting for the loop.
            children[1].emit('close', 0)
            await flushPromises()
            await vi.advanceTimersByTimeAsync(1_000)

            expect(children).toHaveLength(2)
            expect(testService.runAllTests).toHaveBeenCalledTimes(2)
            expect(service.getPipeline(pipeline.pipelineRunId)?.steps.map((s) => s.status)).toEqual(
                ['success', 'stopped', 'skipped']
            )
        })
    })

    describe('queue', () => {
        it('drains after the stop is done: production first, develop next', async () => {
            stubRuns()
            await service.startPipeline(undefined, 'script', 'develop', {notify: true})
            await flushPromises()
            await service.requestPipelineRun({source: 'script', notify: true, pipeline: 'develop'})
            await service.requestPipelineRun({
                source: 'script',
                notify: true,
                pipeline: 'production',
            })
            expect(service.getQueue().map((q) => q.pipeline)).toEqual(['production', 'develop'])

            const stopped = service.stop('manual')
            await flushPromises()
            // Not started while the cleanup is still running.
            expect(testService.runAllTests).toHaveBeenCalledTimes(1)

            await finishStop(stopped)
            await flushPromises()

            expect(service.getCurrentPipeline()?.pipeline).toBe('production')
            expect(service.getCurrentPipeline()?.status).toBe('running')
            expect(testService.runAllTests).toHaveBeenCalledTimes(2)
            expect(service.getQueue().map((q) => q.pipeline)).toEqual(['develop'])
        })

        it('refuses a manual start while the stop is cleaning up', async () => {
            stubRuns()
            await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()

            const stopped = service.stop('manual')
            await expect(service.startPipeline()).rejects.toThrow('TESTS_ALREADY_RUNNING')
            await finishStop(stopped)
        })
    })

    describe('in-flight pipeline marker', () => {
        it('carries the process group and a write time taken after the spawn (the startup kill bound)', async () => {
            const spawnedAt = Date.now()
            testService.runAllTests.mockImplementation(
                async (_w: unknown, _s: unknown, project: string) => {
                    const child = createChild()
                    child.pid = 4321
                    children.push(child)
                    runProcessRegistry.register({runId: 'run-pg', type: 'run-all', project}, child)
                    return {runId: 'run-pg', process: child}
                }
            )

            await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()

            const writes = settings.setInFlightPipeline.mock.calls.map((c: any[]) => c[0])
            const withGroup = writes.find((m: any) => m.pgids.includes(4321))
            expect(withGroup).toBeDefined()
            expect(withGroup.runIds).toEqual(['run-pg'])
            // writtenAt is what killLeftoverPlaywrightGroups compares process age against
            expect(new Date(withGroup.writtenAt).toISOString()).toBe(withGroup.writtenAt)
            expect(new Date(withGroup.writtenAt).getTime()).toBeGreaterThanOrEqual(spawnedAt)
        })

        it('every write carries writtenAt, including the first one before any spawn', async () => {
            stubRuns()

            await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()

            const writes = settings.setInFlightPipeline.mock.calls.map((c: any[]) => c[0])
            expect(writes.length).toBeGreaterThan(0)
            for (const marker of writes) expect(marker.writtenAt).toEqual(expect.any(String))
        })
    })

    describe('restart cleanup', () => {
        it('SIGKILLs the marker groups BEFORE it deletes the marker runs, and deletes only those runs', async () => {
            const order: string[] = []
            vi.mocked(killLeftoverPlaywrightGroups).mockImplementation(async () => {
                order.push('kill')
                return [900]
            })
            testService.discardRuns.mockImplementation(async () => {
                order.push('discard')
            })
            settings.getInFlightPipeline.mockResolvedValue({
                pipeline: 'production',
                source: 'script',
                notify: true,
                startedAt: '2026-01-01T00:00:00.000Z',
                runIds: ['run-a', 'run-b'],
                projects: ['Smoke'],
                pgids: [900, 901],
                writtenAt: '2026-01-01T00:05:00.000Z',
            })

            await service.handleInterruptedOnStartup()

            expect(killLeftoverPlaywrightGroups).toHaveBeenCalledWith([
                {pgid: 900, markerWrittenAt: '2026-01-01T00:05:00.000Z'},
                {pgid: 901, markerWrittenAt: '2026-01-01T00:05:00.000Z'},
            ])
            expect(order).toEqual(['kill', 'discard'])
            // Exactly the marker's runs and a discovery scope from the pipeline start; never a sweep of 'running' rows.
            expect(testService.discardRuns).toHaveBeenCalledTimes(1)
            expect(testService.discardRuns).toHaveBeenCalledWith(
                ['run-a', 'run-b'],
                [{project: 'Smoke', since: '2026-01-01T00:00:00.000Z'}]
            )
            expect(notifier.notifyInterrupted).toHaveBeenCalledWith('production', ['Smoke'])
            expect(settings.clearInFlightPipeline).toHaveBeenCalledTimes(1)
        })

        it('still clears the marker and posts the interrupted message when the deletion fails', async () => {
            testService.discardRuns.mockRejectedValue(new Error('db locked'))
            settings.getInFlightPipeline.mockResolvedValue({
                pipeline: 'develop',
                source: 'script',
                notify: true,
                startedAt: '2026-01-01T00:00:00.000Z',
                runIds: ['run-a'],
                projects: ['API'],
                pgids: [],
            })

            await service.handleInterruptedOnStartup()

            expect(settings.clearInFlightPipeline).toHaveBeenCalledTimes(1)
            expect(notifier.notifyInterrupted).toHaveBeenCalledTimes(1)
        })

        it('cleans up after a manual run that was alive at the restart, whatever status its killed reporter left (marker of a non-pipeline run)', async () => {
            settings.getInFlightRun.mockResolvedValue({
                runId: 'manual-run',
                pgid: 777,
                project: 'API',
                pendingSince: '2026-01-01T00:00:00.000Z',
                startedAt: '2026-01-01T00:00:01.000Z',
            })

            await service.handleInterruptedOnStartup()

            expect(killLeftoverPlaywrightGroups).toHaveBeenCalledWith([
                {pgid: 777, markerWrittenAt: '2026-01-01T00:00:01.000Z'},
            ])
            expect(testService.discardRuns).toHaveBeenCalledWith(
                ['manual-run'],
                [{project: 'API', since: '2026-01-01T00:00:00.000Z'}]
            )
            expect(settings.clearInFlightRun).toHaveBeenCalledTimes(1)
            expect(notifier.notifyInterrupted).not.toHaveBeenCalled()
        })

        it('deletes nothing without a marker', async () => {
            await service.handleInterruptedOnStartup()

            expect(killLeftoverPlaywrightGroups).not.toHaveBeenCalled()
            expect(testService.discardRuns).not.toHaveBeenCalled()
        })
    })

    describe('server shutdown', () => {
        it('does not carry on with the next step or post a result when the children were killed for shutdown', async () => {
            stubRuns()
            const pipeline = await service.startPipeline(undefined, 'script', 'develop', {
                notify: true,
            })
            await flushPromises()
            vi.spyOn(runProcessRegistry, 'isShuttingDown').mockReturnValue(true)

            children[0].emit('close', 130)
            await flushPromises()

            expect(testService.runAllTests).toHaveBeenCalledTimes(1)
            expect(notifier.notifyResult).not.toHaveBeenCalled()
            // The marker stays: the next start deletes this run's data.
            expect(settings.clearInFlightPipeline).not.toHaveBeenCalled()
            expect(service.getPipeline(pipeline.pipelineRunId)?.status).toBe('running')
        })
    })
})

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
function createChild(options: {ignoreSigint?: boolean} = {}) {
    const child: any = new EventEmitter()
    child.pid = undefined
    child.exitCode = null
    child.signalCode = null
    child.kill = vi.fn((signal: string) => {
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
    function stubRuns(childOptions: {ignoreSigint?: boolean} = {}) {
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

        testService = {
            runAllTests: vi.fn(),
            discardRuns: vi.fn().mockResolvedValue(undefined),
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

    describe('stopping a pipeline mid-step', () => {
        it('signals the child, waits for it to close, deletes the run, and ends the pipeline cancelled', async () => {
            stubRuns()
            const pipeline = await service.startPipeline(undefined, 'script', 'develop', {
                notify: true,
            })
            await flushPromises()

            const stopped = service.stop('manual')

            // Flags and signal first; nothing is deleted while the child may still be writing.
            expect(children[0].kill).toHaveBeenCalledWith('SIGINT')
            expect(websocket.broadcastRunStopping).toHaveBeenCalledWith('manual')
            expect(queue.isBusy()).toBe(true)
            expect(testService.discardRuns).not.toHaveBeenCalled()

            const outcome = await finishStop(stopped)

            expect(outcome).toEqual({
                stopped: true,
                reason: 'manual',
                pipelineRunId: pipeline.pipelineRunId,
                runIds: ['run-1'],
            })
            // The second step never spawned.
            expect(testService.runAllTests).toHaveBeenCalledTimes(1)
            expect(service.getPipeline(pipeline.pipelineRunId)?.status).toBe('cancelled')
            expect(service.getPipeline(pipeline.pipelineRunId)?.steps.map((s) => s.status)).toEqual(
                ['skipped', 'skipped']
            )
            expect(websocket.broadcastPipelineCompleted).toHaveBeenCalledWith(
                pipeline.pipelineRunId,
                'cancelled',
                expect.any(Array)
            )
            expect(websocket.broadcastRunCancelled).toHaveBeenCalledWith(
                ['run-1'],
                'manual',
                pipeline.pipelineRunId
            )
            expect(settings.clearInFlightPipeline).toHaveBeenCalled()
            expect(queue.isBusy()).toBe(false)
        })

        it('deletes the run, the discovery rows of every step since the pipeline began, and clears the manual-run marker', async () => {
            stubRuns()
            const pipeline = await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()

            await finishStop(service.stop('manual'))

            expect(testService.discardRuns).toHaveBeenCalledWith(
                ['run-1'],
                [
                    {project: 'API', since: pipeline.startedAt},
                    {project: 'WEB', since: pipeline.startedAt},
                ]
            )
            expect(testService.clearRunMarker).toHaveBeenCalled()
        })

        it('does not read the killed step as a crash: no stopped_early, no "Stopped at" message', async () => {
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

        it('marks the run as cancelled so late reporter posts are ignored', async () => {
            stubRuns()
            await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()

            const stopped = service.stop('manual')
            expect(runProcessRegistry.isCancelled('run-1')).toBe(true)
            await finishStop(stopped)
        })

        it('escalates to SIGKILL for a child that ignores SIGINT', async () => {
            stubRuns({ignoreSigint: true})
            await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()

            const stopped = service.stop('manual')
            await vi.advanceTimersByTimeAsync(19_000)
            expect(children[0].kill).not.toHaveBeenCalledWith('SIGKILL')

            await vi.advanceTimersByTimeAsync(1_500)
            expect(children[0].kill).toHaveBeenCalledWith('SIGKILL')

            await finishStop(stopped)
            expect(testService.discardRuns).toHaveBeenCalled()
        })
    })

    describe('deleting finished steps too', () => {
        it('stopping during step 2 deletes step 1 results as well', async () => {
            stubRuns()
            const pipeline = await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()
            children[0].emit('close', 0)
            await flushPromises()
            expect(service.getPipeline(pipeline.pipelineRunId)?.steps[0].status).toBe('success')
            expect(children).toHaveLength(2)

            await finishStop(service.stop('manual'))

            expect(testService.discardRuns).toHaveBeenCalledWith(
                ['run-1', 'run-2'],
                expect.any(Array)
            )
            const steps = service.getPipeline(pipeline.pipelineRunId)?.steps
            expect(steps?.map((s) => s.status)).toEqual(['skipped', 'skipped'])
            expect(steps?.every((s) => s.runId === undefined && s.passed === undefined)).toBe(true)
        })
    })

    describe('stopping before a child exists', () => {
        it('between steps: step 2 is still in discovery, so it never spawns and step 1 is deleted', async () => {
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
            // Waits for the start in discovery to unwind before it deletes anything.
            expect(done).toBe(false)
            expect(testService.discardRuns).not.toHaveBeenCalled()

            step2Discovery.resolve()
            await finishStop(stopped)

            expect(testService.runAllTests).toHaveBeenCalledTimes(2)
            expect(children).toHaveLength(1)
            expect(testService.discardRuns).toHaveBeenCalledWith(['run-1'], expect.any(Array))
            expect(service.getPipeline(pipeline.pipelineRunId)?.status).toBe('cancelled')
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
            expect(testService.discardRuns).toHaveBeenCalledWith(
                [],
                expect.arrayContaining([{project: 'API', since: pipeline.startedAt}])
            )
            expect(service.getPipeline(pipeline.pipelineRunId)?.status).toBe('cancelled')
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

    describe('a failed delete', () => {
        it('still ends the pipeline cancelled, frees the dashboard, logs loudly, and rejects (HTTP 500)', async () => {
            stubRuns()
            testService.discardRuns.mockRejectedValue(new Error('database is locked'))
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
            // The text must be true: a second Stop finds nothing running, so the log names the run ids to delete by hand.
            expect(Logger.error).toHaveBeenCalledWith(
                expect.stringMatching(/STOP CLEANUP FAILED.*delete them by hand.*run-1/),
                expect.any(Error)
            )
            expect(Logger.error).not.toHaveBeenCalledWith(
                expect.stringContaining('press Stop again'),
                expect.anything()
            )
            testService.discardRuns.mockClear()
            expect(await service.stop('manual')).toEqual({stopped: false, runIds: []})
            expect(testService.discardRuns).not.toHaveBeenCalled()
            expect(websocket.broadcastRunCancelled).toHaveBeenCalled()
            expect(settings.clearInFlightPipeline).toHaveBeenCalled()
        })

        it('a new run can start right after a failed stop', async () => {
            stubRuns()
            testService.discardRuns.mockRejectedValueOnce(new Error('disk full'))
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
        it('joins the first one: one signal, one deletion', async () => {
            stubRuns()
            await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()

            const first = service.stop('manual')
            const second = service.stop('manual')
            await finishStop(first)

            expect(await second).toEqual(await first)
            expect(children[0].kill).toHaveBeenCalledTimes(1)
            expect(testService.discardRuns).toHaveBeenCalledTimes(1)
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

        it('manual -> "Stopped manually"', async () => {
            await runStopped('manual', true)

            expect(notifier.notifyStopped).toHaveBeenCalledWith('develop', ['API', 'WEB'])
            expect(notifier.notifyReplaced).not.toHaveBeenCalled()
            expect(notifier.notifyResult).not.toHaveBeenCalled()
        })

        it('replaced -> "Cancelled by a newer deploy"', async () => {
            await runStopped('replaced', true)

            expect(notifier.notifyReplaced).toHaveBeenCalledWith('develop', ['API', 'WEB'])
            expect(notifier.notifyStopped).not.toHaveBeenCalled()
        })

        it.each(['timeout', 'restart'] as const)(
            '%s -> no extra line from the stop (the watchdog / startup announce it themselves)',
            async (reason) => {
                await runStopped(reason, true)

                expect(notifier.notifyStopped).not.toHaveBeenCalled()
                expect(notifier.notifyReplaced).not.toHaveBeenCalled()
                expect(notifier.notifyResult).not.toHaveBeenCalled()
            }
        )

        it.each(['manual', 'replaced', 'timeout', 'restart'] as const)(
            '%s without notify -> nothing is posted',
            async (reason) => {
                await runStopped(reason, false)

                expect(notifier.notifyStopped).not.toHaveBeenCalled()
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

    describe('watchdog', () => {
        it('posts the timeout once, then stops the pipeline and deletes its data (reason timeout)', async () => {
            stubRuns()
            const pipeline = await service.startPipeline(undefined, 'script', 'develop', {
                notify: true,
            })
            await flushPromises()

            await vi.advanceTimersByTimeAsync(30 * 60 * 1000)

            expect(notifier.notifyTimeout).toHaveBeenCalledTimes(1)
            expect(children[0].kill).toHaveBeenCalledWith('SIGINT')

            await vi.advanceTimersByTimeAsync(1_000)
            await flushPromises()

            expect(service.getPipeline(pipeline.pipelineRunId)?.status).toBe('cancelled')
            expect(testService.discardRuns).toHaveBeenCalledWith(['run-1'], expect.any(Array))
            // One line only: the timeout, no "Stopped manually" and no result.
            expect(notifier.notifyStopped).not.toHaveBeenCalled()
            expect(notifier.notifyResult).not.toHaveBeenCalled()
            expect(notifier.notifyTimeout).toHaveBeenCalledTimes(1)
        })

        it('stops a hung child that ignores SIGINT', async () => {
            stubRuns({ignoreSigint: true})
            const pipeline = await service.startPipeline(undefined, 'script', 'develop', {
                notify: true,
            })
            await flushPromises()

            await vi.advanceTimersByTimeAsync(30 * 60 * 1000 + 21_000)
            await vi.advanceTimersByTimeAsync(1_000)
            await flushPromises()

            expect(children[0].kill).toHaveBeenCalledWith('SIGKILL')
            expect(service.getPipeline(pipeline.pipelineRunId)?.status).toBe('cancelled')
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

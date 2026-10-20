import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {EventEmitter} from 'events'
import {PipelineExecutionService} from '../pipelineExecution.service'
import {CIRunQueueService} from '../ciRunQueue.service'
import {runProcessRegistry} from '../runProcessRegistry.service'

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

const flushPromises = () => new Promise((resolve) => setImmediate(resolve))

function deferred<T = void>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((res) => {
        resolve = res
    })
    return {promise, resolve}
}

// A fake Playwright child: it dies when signalled.
function createChild() {
    const child: any = new EventEmitter()
    child.pid = undefined
    child.exitCode = null
    child.signalCode = null
    child.kill = vi.fn((signal: string) => {
        setImmediate(() => child.emit('close', null, signal))
        return true
    })
    return child
}

// A newer deploy replaces the running CI run of the same pipeline: stop (reason replaced) -> slot -> normal drain.
describe('Replace a running CI run (PipelineExecutionService)', () => {
    let service: PipelineExecutionService
    let queue: CIRunQueueService
    let testService: any
    let settings: any
    let websocket: any
    let notifier: any
    let children: any[]

    const tab = (project: string) => ({
        project,
        displayName: `${project} tab`,
        stopPipelineOnFailure: false,
    })

    const ciRequest = (pipeline: 'develop' | 'production', maxWorkers?: number) =>
        service.requestPipelineRun({source: 'script', notify: true, pipeline, maxWorkers})

    const startCI = (pipeline: 'develop' | 'production', notify = true) =>
        service.startPipeline(undefined, 'script', pipeline, {notify})

    // The stop's late-post grace period runs on a faked clock.
    const finishStop = async () => {
        await flushPromises()
        await vi.advanceTimersByTimeAsync(1_000)
        await flushPromises()
    }

    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
        children = []

        testService = {
            // Like TestService.runAllTests: every spawn is registered in the run registry.
            runAllTests: vi.fn(async (_w: unknown, _s: unknown, project: string) => {
                const child = createChild()
                children.push(child)
                const runId = `run-${children.length}`
                runProcessRegistry.register({runId, type: 'run-all', project}, child)
                return {runId, process: child}
            }),
            discardRuns: vi.fn().mockResolvedValue(undefined),
            clearRunMarker: vi.fn().mockResolvedValue(undefined),
        }
        settings = {
            getCIAutoRunPause: vi.fn().mockResolvedValue({paused: false, resumeAt: null}),
            setCIAutoRunPause: vi.fn(),
            getPipelineSteps: vi.fn(async (name: string) =>
                name === 'production' ? [tab('Smoke')] : [tab('API'), tab('WEB')]
            ),
            getInFlightPipeline: vi.fn().mockResolvedValue(null),
            getInFlightRun: vi.fn().mockResolvedValue(null),
            setInFlightPipeline: vi.fn().mockResolvedValue(undefined),
            clearInFlightPipeline: vi.fn().mockResolvedValue(undefined),
            clearInFlightRun: vi.fn().mockResolvedValue(undefined),
        }
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
            {getTestRun: vi.fn().mockResolvedValue({status: 'completed', passedTests: 1})} as any,
            websocket,
            queue,
            notifier
        )
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

    describe('a script+notify request for the pipeline that is running', () => {
        it('stops the old run, deletes what it wrote, answers queued, and the new request starts on the drain', async () => {
            const old = await startCI('develop')
            await flushPromises()

            const result = await ciRequest('develop', 2)

            // Accepted at once; the stop is under way (signal first, nothing deleted yet).
            expect(result).toEqual({status: 'queued', pipeline: 'develop'})
            expect(children[0].kill).toHaveBeenCalledWith('SIGINT')
            expect(websocket.broadcastRunStopping).toHaveBeenCalledWith('replaced')
            expect(testService.discardRuns).not.toHaveBeenCalled()
            expect(queue.getQueue()).toEqual([expect.objectContaining({pipeline: 'develop'})])

            await finishStop()

            expect(testService.discardRuns).toHaveBeenCalledTimes(1)
            expect(testService.discardRuns).toHaveBeenCalledWith(['run-1'], expect.any(Array))
            expect(service.getPipeline(old.pipelineRunId)?.status).toBe('cancelled')
            // The new request is now the running pipeline (its first step got the requested workers).
            const current = service.getCurrentPipeline()
            expect(current?.pipelineRunId).not.toBe(old.pipelineRunId)
            expect(current).toMatchObject({pipeline: 'develop', status: 'running', notify: true})
            expect(testService.runAllTests).toHaveBeenCalledTimes(2)
            expect(testService.runAllTests.mock.calls[1][0]).toBe(2)
            expect(queue.getQueue()).toEqual([])
        })

        it('posts "Cancelled by a newer deploy" once, no result and no "Stopped manually"', async () => {
            await startCI('develop')
            await flushPromises()

            await ciRequest('develop')
            await finishStop()

            expect(notifier.notifyReplaced).toHaveBeenCalledTimes(1)
            expect(notifier.notifyReplaced).toHaveBeenCalledWith('develop', ['API', 'WEB'])
            expect(notifier.notifyStopped).not.toHaveBeenCalled()
            expect(notifier.notifyResult).not.toHaveBeenCalled()
        })

        it('replaces a run that is still starting (tab list being read)', async () => {
            const tabs = deferred<any[]>()
            settings.getPipelineSteps.mockReturnValueOnce(tabs.promise)
            const started = startCI('develop')
            await flushPromises()

            const result = await ciRequest('develop')
            tabs.resolve([tab('API'), tab('WEB')])
            const old = await started
            await finishStop()

            expect(result.status).toBe('queued')
            expect(service.getPipeline(old.pipelineRunId)?.status).toBe('cancelled')
            expect(notifier.notifyReplaced).toHaveBeenCalledTimes(1)
            // The old run never spawned; only the new one did.
            expect(testService.runAllTests).toHaveBeenCalledTimes(1)
            expect(service.getCurrentPipeline()?.pipelineRunId).not.toBe(old.pipelineRunId)
        })

        it('leaves the old run alone when auto-run is paused (the request is refused)', async () => {
            await startCI('develop')
            await flushPromises()
            settings.getCIAutoRunPause.mockResolvedValue({paused: true, resumeAt: null})

            await expect(ciRequest('develop')).rejects.toThrow('CI_AUTORUN_PAUSED')

            expect(children[0].kill).not.toHaveBeenCalled()
            expect(service.getCurrentPipeline()?.status).toBe('running')
        })
    })

    describe('what is not replaced', () => {
        it('a --wait run (no notify): the request waits in the slot, the run is not touched', async () => {
            await startCI('develop', false)
            await flushPromises()

            const result = await ciRequest('develop')
            await finishStop()

            expect(result.status).toBe('queued')
            expect(children[0].kill).not.toHaveBeenCalled()
            expect(testService.discardRuns).not.toHaveBeenCalled()
            expect(notifier.notifyReplaced).not.toHaveBeenCalled()
            expect(service.getCurrentPipeline()?.status).toBe('running')
            expect(queue.getQueue()).toHaveLength(1)
        })

        it('a manually started pipeline (UI): queued, not replaced', async () => {
            await service.startPipeline(undefined, undefined, 'develop')
            await flushPromises()

            const result = await ciRequest('develop')
            await finishStop()

            expect(result.status).toBe('queued')
            expect(children[0].kill).not.toHaveBeenCalled()
            expect(notifier.notifyReplaced).not.toHaveBeenCalled()
        })

        it('a manual single run: queued, not replaced', async () => {
            const manual = createChild()
            runProcessRegistry.register({runId: 'manual-1', type: 'run-all'}, manual)

            const result = await ciRequest('develop')
            await finishStop()

            expect(result.status).toBe('queued')
            expect(manual.kill).not.toHaveBeenCalled()
            expect(notifier.notifyReplaced).not.toHaveBeenCalled()
            manual.emit('close', 0)
        })

        it('another pipeline name running: queued, not replaced', async () => {
            await startCI('production')
            await flushPromises()

            const result = await ciRequest('develop')
            await finishStop()

            expect(result.status).toBe('queued')
            expect(children[0].kill).not.toHaveBeenCalled()
            expect(notifier.notifyReplaced).not.toHaveBeenCalled()
            expect(service.getCurrentPipeline()?.pipeline).toBe('production')
        })
    })

    describe('production queued while develop is replaced', () => {
        it('production starts first on the drain, the new develop request stays queued', async () => {
            await startCI('develop')
            await flushPromises()
            await ciRequest('production')

            await ciRequest('develop')
            await finishStop()

            expect(service.getCurrentPipeline()).toMatchObject({
                pipeline: 'production',
                status: 'running',
            })
            expect(queue.getQueue().map((q) => q.pipeline)).toEqual(['develop'])
            expect(notifier.notifyReplaced).toHaveBeenCalledTimes(1)
        })
    })

    describe('a burst of requests', () => {
        it('three develop requests: one stop, the newest wins', async () => {
            await startCI('develop')
            await flushPromises()

            const results = await Promise.all([
                ciRequest('develop', 1),
                ciRequest('develop', 2),
                ciRequest('develop', 3),
            ])
            await finishStop()

            expect(results.map((r) => r.status)).toEqual(['queued', 'queued', 'queued'])
            expect(children[0].kill).toHaveBeenCalledTimes(1)
            expect(testService.discardRuns).toHaveBeenCalledTimes(1)
            expect(notifier.notifyReplaced).toHaveBeenCalledTimes(1)
            // Old run + one new run; the middle requests never ran.
            expect(testService.runAllTests).toHaveBeenCalledTimes(2)
            expect(testService.runAllTests.mock.calls[1][0]).toBe(3)
            expect(queue.getQueue()).toEqual([])
        })
    })

    describe('a stop that is already ending the run', () => {
        it('a manual stop in flight: no second signal, no second delete, no "newer deploy" line; the slot starts on the drain', async () => {
            const old = await startCI('develop')
            await flushPromises()
            const manualStop = service.stop('manual')

            const result = await ciRequest('develop', 4)
            await finishStop()
            await manualStop

            expect(result.status).toBe('queued')
            expect(children[0].kill).toHaveBeenCalledTimes(1)
            expect(testService.discardRuns).toHaveBeenCalledTimes(1)
            expect(notifier.notifyStopped).toHaveBeenCalledTimes(1)
            expect(notifier.notifyReplaced).not.toHaveBeenCalled()
            expect(service.getPipeline(old.pipelineRunId)?.status).toBe('cancelled')
            expect(service.getCurrentPipeline()?.pipelineRunId).not.toBe(old.pipelineRunId)
            expect(testService.runAllTests).toHaveBeenCalledTimes(2)
        })

        it('the watchdog stop in flight: one timeout line, no "newer deploy" line, one delete', async () => {
            await startCI('develop')
            await flushPromises()
            await vi.advanceTimersByTimeAsync(30 * 60 * 1000)
            expect(notifier.notifyTimeout).toHaveBeenCalledTimes(1)

            await ciRequest('develop')
            await finishStop()

            expect(children[0].kill).toHaveBeenCalledTimes(1)
            expect(testService.discardRuns).toHaveBeenCalledTimes(1)
            expect(notifier.notifyReplaced).not.toHaveBeenCalled()
            expect(notifier.notifyTimeout).toHaveBeenCalledTimes(1)
            expect(testService.runAllTests).toHaveBeenCalledTimes(2)
        })

        it('the replace stop in flight when the watchdog fires: no timeout line on top', async () => {
            await startCI('develop')
            await flushPromises()
            await vi.advanceTimersByTimeAsync(30 * 60 * 1000 - 500)

            await ciRequest('develop')
            await flushPromises()
            // The watchdog fires while the replace is still cleaning up.
            await vi.advanceTimersByTimeAsync(500)
            await finishStop()

            expect(notifier.notifyTimeout).not.toHaveBeenCalled()
            expect(notifier.notifyReplaced).toHaveBeenCalledTimes(1)
            expect(children[0].kill).toHaveBeenCalledTimes(1)
            expect(testService.discardRuns).toHaveBeenCalledTimes(1)
        })

        it('auto-run turned on right at a step boundary: the replace ends the pipeline, not a "paused" finish', async () => {
            const old = await startCI('develop')
            await flushPromises()

            // The pause check between step 1 and step 2 is still being read when the replace arrives.
            const pauseRead = deferred<{paused: boolean; resumeAt: string | null}>()
            settings.getCIAutoRunPause.mockImplementationOnce(() => pauseRead.promise)
            children[0].emit('close', 0)
            await flushPromises()

            await ciRequest('develop')
            pauseRead.resolve({paused: true, resumeAt: null})
            await finishStop()

            expect(service.getPipeline(old.pipelineRunId)?.status).toBe('cancelled')
            expect(notifier.notifyReplaced).toHaveBeenCalledTimes(1)
            expect(notifier.notifyResult).not.toHaveBeenCalled()
            expect(testService.discardRuns).toHaveBeenCalledTimes(1)
        })

        it('an already paused pipeline is finished, so the next request just starts (nothing to stop)', async () => {
            await startCI('develop')
            await flushPromises()
            settings.getCIAutoRunPause.mockResolvedValue({paused: true, resumeAt: null})
            children[0].emit('close', 0)
            await flushPromises()
            expect(service.getCurrentPipeline()?.status).toBe('paused')
            settings.getCIAutoRunPause.mockResolvedValue({paused: false, resumeAt: null})

            const result = await ciRequest('develop')

            expect(result.status).toBe('started')
            expect(notifier.notifyReplaced).not.toHaveBeenCalled()
            expect(testService.discardRuns).not.toHaveBeenCalled()
        })
    })
})

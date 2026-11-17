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
const rand = () => Math.random().toString(36).slice(2, 8)

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

describe('Per-run Stop target (PipelineExecutionService.stopTarget)', () => {
    let service: PipelineExecutionService
    let testService: any
    let runRepository: any
    let children: any[]

    // Like TestService.runAllTests: every spawn is registered in the run registry.
    const stubRuns = () =>
        testService.runAllTests.mockImplementation(
            async (_workers: unknown, _skip: unknown, project: string) => {
                const child = createChild()
                children.push(child)
                const runId = `run-${project}-${rand()}`
                runProcessRegistry.register({runId, type: 'run-all', project}, child)
                return {runId, process: child}
            }
        )

    // A standalone run (Run All / group / rerun) the registry knows, as TestService registers it at spawn.
    const registerStandalone = (type: 'run-all' | 'run-group' | 'rerun' = 'run-all') => {
        const child = createChild()
        children.push(child)
        const runId = `solo-${rand()}`
        runProcessRegistry.register({runId, type, project: 'API'}, child)
        return {runId, child}
    }

    const finishStop = async <T>(stopped: Promise<T>) => {
        await flushPromises()
        await vi.advanceTimersByTimeAsync(1_000)
        return stopped
    }

    beforeEach(() => {
        vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
        children = []
        ;(runProcessRegistry as any).cancelled.clear()
        ;(runProcessRegistry as any).stopping.clear()

        testService = {
            runAllTests: vi.fn(),
            discardRuns: vi.fn().mockResolvedValue(undefined),
            discardDiscoveryRows: vi.fn().mockResolvedValue(undefined),
            finalizeStoppedRuns: vi.fn(
                async (ids: string[]) =>
                    new Map(ids.map((id) => [id, {total: 1, passed: 1, failed: 0, skipped: 0}]))
            ),
            clearRunMarker: vi.fn().mockResolvedValue(undefined),
        }
        const settings: any = {
            getCIAutoRunPause: vi.fn().mockResolvedValue({paused: false, resumeAt: null}),
            getPipelineSteps: vi.fn().mockResolvedValue([
                {project: 'API', displayName: 'API', stopPipelineOnFailure: false},
                {project: 'WEB', displayName: 'WEB', stopPipelineOnFailure: false},
            ]),
            getInFlightPipeline: vi.fn().mockResolvedValue(null),
            getInFlightRun: vi.fn().mockResolvedValue(null),
            setInFlightPipeline: vi.fn().mockResolvedValue(undefined),
            clearInFlightPipeline: vi.fn().mockResolvedValue(undefined),
            clearInFlightRun: vi.fn().mockResolvedValue(undefined),
        }
        runRepository = {getTestRun: vi.fn().mockResolvedValue(null)}
        const websocket: any = {
            broadcastPipelineStarted: vi.fn(),
            broadcastPipelineStepStarted: vi.fn(),
            broadcastPipelineStepCompleted: vi.fn(),
            broadcastPipelineCompleted: vi.fn(),
            broadcastPipelineQueueChanged: vi.fn(),
            broadcastRunStopping: vi.fn(),
            broadcastRunCancelled: vi.fn(),
        }
        const notifier: any = {
            notifyResult: vi.fn().mockResolvedValue(undefined),
            notifyStopped: vi.fn().mockResolvedValue(undefined),
            notifyTimeLimitStop: vi.fn().mockResolvedValue(undefined),
            notifyReplaced: vi.fn().mockResolvedValue(undefined),
        }
        service = new PipelineExecutionService(
            testService,
            settings,
            runRepository,
            websocket,
            new CIRunQueueService(websocket),
            notifier
        )
    })

    afterEach(async () => {
        vi.useRealTimers()
        for (let i = 0; i < 5; i++) {
            children.forEach((child) => child.emit('close', 0))
            await flushPromises()
        }
        vi.restoreAllMocks()
    })

    it('a live standalone run: the signal goes out in the same tick as the lookup (nothing is awaited in between)', async () => {
        const {runId, child} = registerStandalone()

        const stopped = service.stopTarget(runId)

        // Synchronous: no await between resolving the id and signalling.
        expect(child.kill).toHaveBeenCalledWith('SIGINT')
        const result = await finishStop(stopped)
        expect(result).toMatchObject({
            kind: 'stopped',
            outcome: {stopped: true, reason: 'manual', resultsKept: true, runIds: [runId]},
        })
    })

    it('a run that just ended cannot make the stop hit the next run: 409 and the new run is never signalled', async () => {
        const first = registerStandalone()
        // The first run ends and another one starts before the request is looked at.
        first.child.emit('close', 0)
        const second = registerStandalone('rerun')
        runRepository.getTestRun.mockResolvedValue({id: first.runId, status: 'completed'})

        const result = await service.stopTarget(first.runId)

        expect(result).toEqual({kind: 'not_active', activeRunId: second.runId})
        expect(second.child.kill).not.toHaveBeenCalled()
        expect(testService.finalizeStoppedRuns).not.toHaveBeenCalled()
    })

    it('a pipeline: its pipelineRunId and any step runId stop the WHOLE pipeline (the later step never spawns)', async () => {
        stubRuns()
        const started = await service.startPipeline(undefined, 'script', 'develop', {notify: false})
        await flushPromises()
        const stepRunId = service.getPipeline(started.pipelineRunId)!.steps[0].runId!

        const stopped = service.stopTarget(stepRunId)
        expect(children[0].kill).toHaveBeenCalledWith('SIGINT')
        const result = await finishStop(stopped)

        expect(result).toMatchObject({
            kind: 'stopped',
            outcome: {pipelineRunId: started.pipelineRunId, resultsKept: true},
        })
        expect(testService.runAllTests).toHaveBeenCalledTimes(1)
        expect(service.getPipeline(started.pipelineRunId)).toMatchObject({
            status: 'cancelled',
            stopReason: 'manual',
        })
    })

    it("a FINISHED step's runId while a later step runs also stops the whole pipeline", async () => {
        stubRuns()
        runRepository.getTestRun.mockResolvedValue({
            status: 'completed',
            passedTests: 1,
            failedTests: 0,
        })
        const started = await service.startPipeline(undefined, 'script', 'develop', {notify: false})
        await flushPromises()
        const step1RunId = service.getPipeline(started.pipelineRunId)!.steps[0].runId!
        children[0].emit('close', 0)
        await flushPromises()
        await flushPromises()
        expect(testService.runAllTests).toHaveBeenCalledTimes(2)
        // Step 1's child is gone from the registry: only the pipeline's own step list can resolve this id.
        expect(runProcessRegistry.has(step1RunId)).toBe(false)

        const stopped = service.stopTarget(step1RunId)
        expect(children[1].kill).toHaveBeenCalledWith('SIGINT')
        const result = await finishStop(stopped)

        expect(result).toMatchObject({
            kind: 'stopped',
            outcome: {pipelineRunId: started.pipelineRunId, resultsKept: true},
        })
        expect(service.getPipeline(started.pipelineRunId)?.status).toBe('cancelled')
    })

    it('the pipelineRunId works the same, and so does a second request while the stop is in flight (it joins, one signal)', async () => {
        stubRuns()
        const started = await service.startPipeline(undefined, 'script', 'develop', {notify: false})
        await flushPromises()

        const a = service.stopTarget(started.pipelineRunId)
        const b = service.stopTarget(started.pipelineRunId)
        const results = await finishStop(Promise.all([a, b]))

        expect(results.map((r) => r.kind)).toEqual(['stopped', 'stopped'])
        expect(children[0].kill).toHaveBeenCalledTimes(1)
        expect(testService.finalizeStoppedRuns).toHaveBeenCalledTimes(1)
    })

    it('a finished pipeline (by pipelineRunId) is known but not active: 409, nothing is stopped', async () => {
        stubRuns()
        const started = await service.startPipeline(undefined, 'script', 'develop', {notify: false})
        await flushPromises()
        await finishStop(service.stop('manual'))

        const result = await service.stopTarget(started.pipelineRunId)

        expect(result).toEqual({kind: 'not_active', activeRunId: null})
        expect(runRepository.getTestRun).not.toHaveBeenCalled()
    })

    it('a known run id that is not running answers not_active; an unknown id answers not_found', async () => {
        runRepository.getTestRun.mockImplementation(async (id: string) =>
            id === 'known-run' ? {id, status: 'completed'} : null
        )

        expect(await service.stopTarget('known-run')).toEqual({
            kind: 'not_active',
            activeRunId: null,
        })
        expect(await service.stopTarget('no-such-run')).toEqual({kind: 'not_found'})
    })

    describe('lastStop (the stopped banner, for every tab)', () => {
        // The registry stamps runs in ms: make sure the next run starts in a later ms than the stop.
        const nextMs = async () => {
            const t = Date.now()
            while (Date.now() === t) await flushPromises()
        }

        const stopPipeline = async (reason: 'manual' | 'timeout' | 'replaced' = 'manual') => {
            stubRuns()
            const started = await service.startPipeline(undefined, 'script', 'develop', {
                notify: false,
            })
            await flushPromises()
            await finishStop(service.stop(reason))
            await nextMs()
            return started.pipelineRunId
        }

        const stopStandalone = async (
            type: 'run-all' | 'run-group' | 'rerun',
            extra: {filePath?: string; testName?: string} = {}
        ) => {
            const child = createChild()
            children.push(child)
            runProcessRegistry.register(
                {runId: `solo-${rand()}`, type, project: 'API', ...extra},
                child
            )
            await finishStop(service.stop('manual'))
            await nextMs()
        }

        it('a pipeline stop: kind, name, reason, when, and the steps as they ended', async () => {
            const id = await stopPipeline()

            const stop = service.getLastStop()

            expect(stop).toMatchObject({
                kind: 'pipeline',
                name: 'develop',
                reason: 'manual',
                pipelineRunId: id,
            })
            expect(stop?.stoppedAt).toEqual(expect.any(String))
            expect(stop?.steps?.map((s) => s.status)).toEqual(['stopped', 'skipped'])
            expect(stop?.timeLimitMinutes).toBeUndefined()
        })

        it('a time-limit stop says so and carries the limit', async () => {
            await stopPipeline('timeout')

            expect(service.getLastStop()).toMatchObject({reason: 'timeout', timeLimitMinutes: 30})
        })

        it.each([
            ['Run All', 'run-all', {}, 'API'],
            ['a group run', 'run-group', {filePath: 'tests/web/login.spec.ts'}, 'login.spec.ts'],
            ['a rerun', 'rerun', {testName: 'user can log in'}, 'user can log in'],
        ] as const)(
            'a standalone %s is remembered too, by what it was',
            async (_n, type, extra, name) => {
                await stopStandalone(type, extra)

                const stop = service.getLastStop()

                expect(stop).toMatchObject({kind: type, name, reason: 'manual'})
                expect(stop?.steps).toBeUndefined()
            }
        )

        it('the stopped run ending is not a newer run; a newer run still running does not end it; once it ENDS it is over, on every later read', async () => {
            await stopPipeline()
            expect(service.getLastStop()).not.toBeNull()
            const next = registerStandalone('rerun')

            expect(service.getLastStop()).not.toBeNull()

            next.child.emit('close', 0)

            expect(service.getLastStop()).toBeNull()
            expect(service.getLastStop()).toBeNull()
        })

        it('a newer stop replaces the older one', async () => {
            await stopPipeline()
            // Let the older stop's runs be gone, then stop a standalone run: it began after the pipeline stop.
            children.forEach((c) => c.emit('close', 0))
            await flushPromises()
            await stopStandalone('run-all')

            // The second run began after the first stop and ended (it was stopped) -> the first is superseded;
            // its own stop is newer than that run, so it is the one shown.
            expect(service.getLastStop()).toMatchObject({kind: 'run-all'})
        })

        it('the next CI pipeline starting clears it', async () => {
            await stopStandalone('run-all')
            expect(service.getLastStop()).not.toBeNull()
            stubRuns()

            await service.startPipeline(undefined, 'script', 'develop', {notify: false})

            expect(service.getLastStop()).toBeNull()
        })

        it('a discarded stop (replaced) leaves nothing to show', async () => {
            await stopPipeline('replaced')

            expect(service.getLastStop()).toBeNull()
        })
    })
})

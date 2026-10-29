import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {EventEmitter} from 'events'
import {TestService} from '../test.service'
import {PipelineExecutionService} from '../pipelineExecution.service'
import {CIRunQueueService} from '../ciRunQueue.service'

vi.mock('../../utils/logger.util', () => ({
    Logger: {info: vi.fn(), error: vi.fn(), warn: vi.fn(), testDiscovery: vi.fn()},
}))

// Real queue + real services; only the tracker's busy answer follows addProcess/removeProcess.
const tracked = new Set<string>()
vi.mock('../activeProcesses.service', () => ({
    activeProcessesTracker: {
        addProcess: vi.fn((data: {runId: string}) => tracked.add(data.runId)),
        removeProcess: vi.fn((runId: string) => tracked.delete(runId)),
        isProcessRunning: vi.fn((runId: string) => tracked.has(runId)),
        isAnyProcessRunning: vi.fn(() => tracked.size > 0),
        isRunAllActive: vi.fn(() => false),
        getActiveProcesses: vi.fn(() => []),
    },
}))

const flush = () => new Promise((resolve) => setImmediate(resolve))

function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((r) => (resolve = r))
    return {promise, resolve}
}

// The registry is a process-wide singleton: every spawned fake child is closed after the test.
const spawned: EventEmitter[] = []

const startedRun = (runId: string) => {
    const process = new EventEmitter()
    spawned.push(process)
    return {
        runId,
        message: 'started',
        timestamp: '2026-01-01T00:00:00.000Z',
        process: process as any,
    }
}

describe('manual starts racing a CI pipeline start', () => {
    let testService: TestService
    let pipelineService: PipelineExecutionService
    let playwright: any
    let settings: any
    let testRepository: any
    let runRepository: any

    afterEach(() => {
        spawned.splice(0).forEach((process) => process.emit('close', 0))
    })

    beforeEach(() => {
        vi.clearAllMocks()
        tracked.clear()

        testRepository = {
            deletePendingRows: vi.fn().mockResolvedValue(0),
            saveTestResult: vi.fn(),
            getProjectByFilePath: vi.fn().mockResolvedValue(''),
            getTestResult: vi.fn().mockResolvedValue({
                id: 'exec-1',
                testId: 'hash-1',
                name: 'Test 1',
                filePath: '/a.spec.ts',
                project: 'API',
            }),
        }
        runRepository = {
            createTestRun: vi.fn().mockResolvedValue('run'),
            updateTestRun: vi.fn(),
            getTestRun: vi.fn().mockResolvedValue({status: 'completed', passedTests: 1}),
        }
        playwright = {
            discoverTests: vi.fn().mockResolvedValue([]),
            runAllTests: vi.fn().mockImplementation(async () => startedRun('step-run')),
            runTestGroup: vi.fn().mockImplementation(async () => startedRun('group-run')),
            rerunSingleTest: vi.fn().mockImplementation(async () => startedRun('rerun-run')),
        }
        settings = {
            getGlobalPlaywrightProject: vi.fn().mockResolvedValue(''),
            getCIAutoRunPause: vi.fn().mockResolvedValue({paused: false, resumeAt: null}),
            getPipelineSteps: vi
                .fn()
                .mockResolvedValue([
                    {project: 'API', displayName: 'API', stopPipelineOnFailure: false},
                ]),
            setInFlightPipeline: vi.fn().mockResolvedValue(undefined),
            clearInFlightPipeline: vi.fn().mockResolvedValue(undefined),
        }
        const websocket: any = new Proxy({}, {get: () => vi.fn()})
        const queue = new CIRunQueueService(websocket)

        testService = new TestService(
            testRepository,
            runRepository,
            playwright,
            websocket,
            {} as any,
            {} as any,
            settings,
            {} as any,
            queue,
            {upsertMany: vi.fn(), deleteStale: vi.fn(), markFullScan: vi.fn()} as any
        )
        pipelineService = new PipelineExecutionService(
            testService,
            settings,
            runRepository,
            websocket,
            queue,
            {notifyResult: vi.fn().mockResolvedValue(undefined)} as any
        )
    })

    it('a group click inside the pipeline start window is refused and step 1 still runs', async () => {
        const steps = deferred<unknown[]>()
        settings.getPipelineSteps.mockReturnValueOnce(steps.promise)

        const started = pipelineService.requestPipelineRun({source: 'script', notify: true})
        await flush() // startPipeline holds its claim and awaits the tab list

        await expect(testService.runTestGroup('/a.spec.ts')).rejects.toThrow(
            'TESTS_ALREADY_RUNNING'
        )
        expect(playwright.runTestGroup).not.toHaveBeenCalled()

        steps.resolve([{project: 'API', displayName: 'API', stopPipelineOnFailure: false}])
        await started
        await flush()

        expect(playwright.runAllTests).toHaveBeenCalledTimes(1)
        expect(pipelineService.getCurrentPipeline()?.steps[0].status).toBe('running')
    })

    it('a rerun whose test lookup is still pending when a pipeline starts is refused', async () => {
        const lookup = deferred<unknown>()
        testRepository.getTestResult.mockReturnValueOnce(lookup.promise)

        const rerun = testService.rerunTest('exec-1')
        const rejection = expect(rerun).rejects.toThrow('TESTS_ALREADY_RUNNING')
        await flush()

        await pipelineService.startPipeline(undefined, 'script', 'develop', {notify: true})
        await flush()
        expect(playwright.runAllTests).toHaveBeenCalledTimes(1)

        lookup.resolve({id: 'exec-1', testId: 'hash-1', name: 'T', filePath: '/a.spec.ts'})
        await rejection

        expect(playwright.rerunSingleTest).not.toHaveBeenCalled()
        expect(pipelineService.getCurrentPipeline()?.steps[0].status).toBe('running')
    })

    it('a manual run-all between pipeline steps is refused', async () => {
        const first = startedRun('step-1')
        const gate = deferred<ReturnType<typeof startedRun>>()
        playwright.runAllTests.mockResolvedValueOnce(first).mockReturnValueOnce(gate.promise)
        settings.getPipelineSteps.mockResolvedValue([
            {project: 'API', displayName: 'API', stopPipelineOnFailure: false},
            {project: 'WEB', displayName: 'WEB', stopPipelineOnFailure: false},
        ])

        await pipelineService.startPipeline(undefined, 'script', 'develop')
        await flush()
        first.process.emit('close', 0) // step 1 gone, step 2 still in discovery/spawn
        await flush()

        await expect(testService.runAllTests(2, true, 'UI')).rejects.toThrow(
            'TESTS_ALREADY_RUNNING'
        )

        gate.resolve(startedRun('step-2'))
        await flush()
        expect(playwright.runAllTests).toHaveBeenCalledTimes(2)
    })
})

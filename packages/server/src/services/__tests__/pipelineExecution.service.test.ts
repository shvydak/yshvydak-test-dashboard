import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {EventEmitter} from 'events'
import {PipelineExecutionService} from '../pipelineExecution.service'
import {CIRunQueueService} from '../ciRunQueue.service'

vi.mock('../../utils/logger.util', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
}))

vi.mock('../activeProcesses.service', () => ({
    activeProcessesTracker: {
        isAnyProcessRunning: vi.fn(() => false),
        getActiveProcesses: vi.fn(() => []),
    },
}))

import {activeProcessesTracker} from '../activeProcesses.service'
import {runProcessRegistry} from '../runProcessRegistry.service'

function flushPromises() {
    return new Promise((resolve) => setImmediate(resolve))
}

function createMockProcess() {
    return new EventEmitter() as any
}

describe('PipelineExecutionService', () => {
    let service: PipelineExecutionService
    let queue: CIRunQueueService
    let mockTestService: any
    let mockSettingsService: any
    let mockRunRepository: any
    let mockWebSocketService: any
    let mockNotifier: any

    beforeEach(() => {
        vi.clearAllMocks()
        // Fake children are never registered as busy; tests flip this to model a live process.
        vi.spyOn(runProcessRegistry, 'isAnyRunning').mockReturnValue(false)
        vi.mocked(activeProcessesTracker.getActiveProcesses).mockReturnValue([])

        mockTestService = {
            runAllTests: vi.fn(),
            discardRuns: vi.fn().mockResolvedValue(undefined),
            clearRunMarker: vi.fn().mockResolvedValue(undefined),
        }
        mockSettingsService = {
            getCIAutoRunPause: vi.fn().mockResolvedValue({paused: false, resumeAt: null}),
            setCIAutoRunPause: vi.fn(),
            getPipelineSteps: vi.fn().mockResolvedValue([]),
            getInFlightPipeline: vi.fn().mockResolvedValue(null),
            getInFlightRun: vi.fn().mockResolvedValue(null),
            clearInFlightRun: vi.fn().mockResolvedValue(undefined),
            setInFlightPipeline: vi.fn().mockResolvedValue(undefined),
            clearInFlightPipeline: vi.fn().mockResolvedValue(undefined),
        }
        mockRunRepository = {getTestRun: vi.fn()}
        mockWebSocketService = {
            broadcastPipelineStarted: vi.fn(),
            broadcastPipelineStepStarted: vi.fn(),
            broadcastPipelineStepCompleted: vi.fn(),
            broadcastPipelineCompleted: vi.fn(),
            broadcastPipelineQueueChanged: vi.fn(),
            broadcastRunStopping: vi.fn(),
            broadcastRunCancelled: vi.fn(),
        }
        mockNotifier = {
            notifyResult: vi.fn().mockResolvedValue(undefined),
            notifyTimeout: vi.fn().mockResolvedValue(undefined),
            notifyInterrupted: vi.fn().mockResolvedValue(undefined),
            notifyPaused: vi.fn().mockResolvedValue(undefined),
            notifyNotStarted: vi.fn().mockResolvedValue(undefined),
            notifyStopped: vi.fn().mockResolvedValue(undefined),
            notifyReplaced: vi.fn().mockResolvedValue(undefined),
        }

        queue = new CIRunQueueService(mockWebSocketService)
        service = new PipelineExecutionService(
            mockTestService,
            mockSettingsService,
            mockRunRepository,
            mockWebSocketService,
            queue,
            mockNotifier
        )
    })

    describe('startPipeline() guard checks', () => {
        it('throws PIPELINE_EMPTY when no tabs are configured to run in the pipeline', async () => {
            mockSettingsService.getPipelineSteps.mockResolvedValue([])

            await expect(service.startPipeline()).rejects.toThrow('PIPELINE_EMPTY')
            expect(mockTestService.runAllTests).not.toHaveBeenCalled()
        })

        it('throws TESTS_ALREADY_RUNNING when a process is already active', async () => {
            vi.mocked(runProcessRegistry.isAnyRunning).mockReturnValue(true)
            mockSettingsService.getPipelineSteps.mockResolvedValue([
                {project: 'A', displayName: 'A', stopPipelineOnFailure: false},
            ])

            await expect(service.startPipeline()).rejects.toThrow('TESTS_ALREADY_RUNNING')
            expect(mockTestService.runAllTests).not.toHaveBeenCalled()
        })

        it('throws CI_AUTORUN_PAUSED for source=script when paused indefinitely', async () => {
            mockSettingsService.getCIAutoRunPause.mockResolvedValue({paused: true, resumeAt: null})

            await expect(service.startPipeline(undefined, 'script')).rejects.toThrow(
                'CI_AUTORUN_PAUSED'
            )
        })

        it('applies CI auto-run pause to every named pipeline when source=script', async () => {
            mockSettingsService.getCIAutoRunPause.mockResolvedValue({paused: true, resumeAt: null})

            await expect(service.startPipeline(undefined, 'script', 'production')).rejects.toThrow(
                'CI_AUTORUN_PAUSED'
            )
        })

        it('does not check CI auto-run pause when source is not "script"', async () => {
            mockSettingsService.getPipelineSteps.mockResolvedValue([
                {project: 'A', displayName: 'A', stopPipelineOnFailure: false},
            ])
            mockTestService.runAllTests.mockResolvedValue({
                runId: 'r1',
                process: createMockProcess(),
            })
            mockRunRepository.getTestRun.mockResolvedValue({passedTests: 1, failedTests: 0})

            await service.startPipeline()

            expect(mockSettingsService.getCIAutoRunPause).not.toHaveBeenCalled()
        })

        it('auto-resumes and proceeds when resumeAt has already passed', async () => {
            mockSettingsService.getCIAutoRunPause.mockResolvedValue({
                paused: true,
                resumeAt: new Date(Date.now() - 1000).toISOString(),
            })
            mockSettingsService.getPipelineSteps.mockResolvedValue([
                {project: 'A', displayName: 'A', stopPipelineOnFailure: false},
            ])
            mockTestService.runAllTests.mockResolvedValue({
                runId: 'r1',
                process: createMockProcess(),
            })
            mockRunRepository.getTestRun.mockResolvedValue({passedTests: 1, failedTests: 0})

            const pipeline = await service.startPipeline(undefined, 'script')

            expect(mockSettingsService.setCIAutoRunPause).toHaveBeenCalledWith(false)
            expect(pipeline.status).toBe('running')
        })
    })

    describe('sequential execution', () => {
        it('runs steps in configured order and completes when all succeed', async () => {
            mockSettingsService.getPipelineSteps.mockResolvedValue([
                {project: 'API_Tests', displayName: 'API Tests', stopPipelineOnFailure: true},
                {project: 'All_Tests', displayName: 'WEB Tests (CI)', stopPipelineOnFailure: false},
            ])
            const proc1 = createMockProcess()
            const proc2 = createMockProcess()
            mockTestService.runAllTests
                .mockResolvedValueOnce({runId: 'run-1', process: proc1})
                .mockResolvedValueOnce({runId: 'run-2', process: proc2})
            mockRunRepository.getTestRun
                .mockResolvedValueOnce({passedTests: 10, failedTests: 0})
                .mockResolvedValueOnce({passedTests: 20, failedTests: 0})

            const pipeline = await service.startPipeline(2)
            await flushPromises()

            expect(mockTestService.runAllTests).toHaveBeenNthCalledWith(
                1,
                2,
                false,
                'API_Tests',
                undefined,
                {pipelineStep: true}
            )

            proc1.emit('close', 0)
            await flushPromises()

            expect(mockTestService.runAllTests).toHaveBeenNthCalledWith(
                2,
                2,
                false,
                'All_Tests',
                undefined,
                {pipelineStep: true}
            )

            proc2.emit('close', 0)
            await flushPromises()

            const finalState = service.getPipeline(pipeline.pipelineRunId)
            expect(finalState?.status).toBe('completed')
            expect(finalState?.steps.map((s) => s.status)).toEqual(['success', 'success'])
            expect(mockWebSocketService.broadcastPipelineCompleted).toHaveBeenCalledWith(
                pipeline.pipelineRunId,
                'completed',
                expect.any(Array)
            )
        })

        it('stops remaining steps when a blocking step fails', async () => {
            mockSettingsService.getPipelineSteps.mockResolvedValue([
                {project: 'API_Tests', displayName: 'API Tests', stopPipelineOnFailure: true},
                {project: 'All_Tests', displayName: 'WEB Tests (CI)', stopPipelineOnFailure: false},
            ])
            const proc1 = createMockProcess()
            mockTestService.runAllTests.mockResolvedValueOnce({runId: 'run-1', process: proc1})
            mockRunRepository.getTestRun.mockResolvedValueOnce({passedTests: 5, failedTests: 3})

            const pipeline = await service.startPipeline()
            await flushPromises()

            proc1.emit('close', 1)
            await flushPromises()

            const finalState = service.getPipeline(pipeline.pipelineRunId)
            expect(finalState?.status).toBe('stopped_early')
            expect(finalState?.steps[0].status).toBe('failed')
            expect(finalState?.steps[1].status).toBe('skipped')
            expect(mockTestService.runAllTests).toHaveBeenCalledTimes(1)
        })

        it('continues past a non-blocking failure (known-issue case)', async () => {
            mockSettingsService.getPipelineSteps.mockResolvedValue([
                {project: 'API_Tests', displayName: 'API Tests', stopPipelineOnFailure: true},
                {project: 'All_Tests', displayName: 'WEB Tests (CI)', stopPipelineOnFailure: false},
            ])
            const proc1 = createMockProcess()
            const proc2 = createMockProcess()
            mockTestService.runAllTests
                .mockResolvedValueOnce({runId: 'run-1', process: proc1})
                .mockResolvedValueOnce({runId: 'run-2', process: proc2})
            mockRunRepository.getTestRun
                .mockResolvedValueOnce({passedTests: 10, failedTests: 0})
                .mockResolvedValueOnce({passedTests: 137, failedTests: 3})

            const pipeline = await service.startPipeline()
            await flushPromises()

            proc1.emit('close', 0)
            await flushPromises()
            proc2.emit('close', 1)
            await flushPromises()

            const finalState = service.getPipeline(pipeline.pipelineRunId)
            expect(finalState?.status).toBe('completed')
            expect(finalState?.steps[1].status).toBe('failed')
            expect(finalState?.steps[1].failed).toBe(3)
        })

        it('marks a step failed and stops the pipeline when it throws instead of resolving', async () => {
            mockSettingsService.getPipelineSteps.mockResolvedValue([
                {project: 'API_Tests', displayName: 'API Tests', stopPipelineOnFailure: true},
                {project: 'All_Tests', displayName: 'WEB Tests (CI)', stopPipelineOnFailure: false},
            ])
            mockTestService.runAllTests.mockRejectedValueOnce(new Error('spawn failed'))

            const pipeline = await service.startPipeline()
            await flushPromises()

            const finalState = service.getPipeline(pipeline.pipelineRunId)
            expect(finalState?.status).toBe('stopped_early')
            expect(finalState?.steps[0].status).toBe('failed')
            expect(finalState?.steps[1].status).toBe('skipped')
        })
    })

    describe('per-step workers override', () => {
        it('uses a step-level workers override instead of the global maxWorkers', async () => {
            mockSettingsService.getPipelineSteps.mockResolvedValue([
                {
                    project: 'API_Tests',
                    displayName: 'API Tests',
                    stopPipelineOnFailure: false,
                    workers: 4,
                },
            ])
            const proc1 = createMockProcess()
            mockTestService.runAllTests.mockResolvedValueOnce({runId: 'run-1', process: proc1})
            mockRunRepository.getTestRun.mockResolvedValueOnce({passedTests: 1, failedTests: 0})

            await service.startPipeline(2)
            await flushPromises()

            expect(mockTestService.runAllTests).toHaveBeenNthCalledWith(
                1,
                4,
                false,
                'API_Tests',
                undefined,
                {pipelineStep: true}
            )
        })

        it('falls back to the global maxWorkers when a step has no override', async () => {
            mockSettingsService.getPipelineSteps.mockResolvedValue([
                {project: 'WEB_Tests', displayName: 'WEB Tests', stopPipelineOnFailure: false},
            ])
            const proc1 = createMockProcess()
            mockTestService.runAllTests.mockResolvedValueOnce({runId: 'run-1', process: proc1})
            mockRunRepository.getTestRun.mockResolvedValueOnce({passedTests: 1, failedTests: 0})

            await service.startPipeline(2)
            await flushPromises()

            expect(mockTestService.runAllTests).toHaveBeenNthCalledWith(
                1,
                2,
                false,
                'WEB_Tests',
                undefined,
                {pipelineStep: true}
            )
        })

        it('applies a different workers override per step in the same pipeline run', async () => {
            mockSettingsService.getPipelineSteps.mockResolvedValue([
                {
                    project: 'API_Tests',
                    displayName: 'API Tests',
                    stopPipelineOnFailure: false,
                    workers: 4,
                },
                {
                    project: 'WEB_Tests',
                    displayName: 'WEB Tests',
                    stopPipelineOnFailure: false,
                    workers: 2,
                },
            ])
            const proc1 = createMockProcess()
            const proc2 = createMockProcess()
            mockTestService.runAllTests
                .mockResolvedValueOnce({runId: 'run-1', process: proc1})
                .mockResolvedValueOnce({runId: 'run-2', process: proc2})
            mockRunRepository.getTestRun
                .mockResolvedValueOnce({passedTests: 1, failedTests: 0})
                .mockResolvedValueOnce({passedTests: 1, failedTests: 0})

            await service.startPipeline(8)
            await flushPromises()

            expect(mockTestService.runAllTests).toHaveBeenNthCalledWith(
                1,
                4,
                false,
                'API_Tests',
                undefined,
                {pipelineStep: true}
            )

            proc1.emit('close', 0)
            await flushPromises()

            expect(mockTestService.runAllTests).toHaveBeenNthCalledWith(
                2,
                2,
                false,
                'WEB_Tests',
                undefined,
                {pipelineStep: true}
            )
        })
    })

    describe('getPipeline() / getCurrentPipeline()', () => {
        it('returns null for an unknown pipelineRunId', () => {
            expect(service.getPipeline('unknown')).toBeNull()
        })

        it('returns null when no pipeline has ever run', () => {
            expect(service.getCurrentPipeline()).toBeNull()
        })
    })

    // ------------------------------------------------------------------------
    // Shared helpers for the CI queue / notifier suites below
    // ------------------------------------------------------------------------

    const tab = (project: string, extra: Record<string, unknown> = {}) => ({
        project,
        displayName: `${project} tab`,
        stopPipelineOnFailure: false,
        ...extra,
    })

    /** getPipelineSteps answers per pipeline name; unlisted names are empty. */
    function stubPipelines(byName: Record<string, any[]>) {
        mockSettingsService.getPipelineSteps.mockImplementation(async (name: string) => {
            return byName[name] ?? []
        })
    }

    /** Every runAllTests call hands out a fresh process; `procs[i]` closes step i. */
    function stubRuns() {
        const procs: any[] = []
        mockTestService.runAllTests.mockImplementation(async () => {
            const proc = createMockProcess()
            procs.push(proc)
            return {runId: `run-${procs.length}`, process: proc}
        })
        return procs
    }

    const runOk = (passed = 1, failed = 0) => ({
        status: 'completed',
        passedTests: passed,
        failedTests: failed,
    })

    describe('requestPipelineRun() and the CI queue', () => {
        beforeEach(() => {
            stubPipelines({develop: [tab('API')], production: [tab('Smoke')]})
            mockRunRepository.getTestRun.mockResolvedValue(runOk())
        })

        it('starts right away when the dashboard is idle', async () => {
            stubRuns()

            const result = await service.requestPipelineRun({source: 'script', notify: true})
            await flushPromises()

            expect(result.status).toBe('started')
            expect((result as any).pipeline.notify).toBe(true)
            expect((result as any).pipeline.pipeline).toBe('develop')
            expect(queue.getQueue()).toEqual([])
        })

        it('queues a script+notify request while a tracked process is running', async () => {
            vi.mocked(runProcessRegistry.isAnyRunning).mockReturnValue(true)

            const result = await service.requestPipelineRun({
                source: 'script',
                notify: true,
                pipeline: 'production',
                maxWorkers: 3,
            })

            expect(result).toEqual({status: 'queued', pipeline: 'production'})
            expect(queue.getQueue()).toEqual([
                expect.objectContaining({pipeline: 'production', maxWorkers: 3}),
            ])
            expect(mockWebSocketService.broadcastPipelineQueueChanged).toHaveBeenCalledTimes(1)
            expect(mockTestService.runAllTests).not.toHaveBeenCalled()
        })

        it('newest request replaces the queued one for the same pipeline', async () => {
            vi.mocked(runProcessRegistry.isAnyRunning).mockReturnValue(true)

            await service.requestPipelineRun({source: 'script', notify: true, maxWorkers: 1})
            await service.requestPipelineRun({source: 'script', notify: true, maxWorkers: 4})

            expect(queue.getQueue()).toHaveLength(1)
            expect(queue.getQueue()[0].maxWorkers).toBe(4)
        })

        it('keeps a separate slot per pipeline, production first', async () => {
            vi.mocked(runProcessRegistry.isAnyRunning).mockReturnValue(true)

            await service.requestPipelineRun({source: 'script', notify: true, pipeline: 'develop'})
            await service.requestPipelineRun({
                source: 'script',
                notify: true,
                pipeline: 'production',
            })

            expect(queue.getQueue().map((q) => q.pipeline)).toEqual(['production', 'develop'])
        })

        it('keeps the 409 for a --wait caller (script without notify)', async () => {
            vi.mocked(runProcessRegistry.isAnyRunning).mockReturnValue(true)

            await expect(service.requestPipelineRun({source: 'script'})).rejects.toThrow(
                'TESTS_ALREADY_RUNNING'
            )
            expect(queue.getQueue()).toEqual([])
        })

        it('keeps the 409 for a non-script request even with notify', async () => {
            vi.mocked(runProcessRegistry.isAnyRunning).mockReturnValue(true)

            await expect(service.requestPipelineRun({notify: true})).rejects.toThrow(
                'TESTS_ALREADY_RUNNING'
            )
            expect(queue.getQueue()).toEqual([])
        })

        it('answers CI_AUTORUN_PAUSED at request time instead of queueing', async () => {
            vi.mocked(runProcessRegistry.isAnyRunning).mockReturnValue(true)
            mockSettingsService.getCIAutoRunPause.mockResolvedValue({paused: true, resumeAt: null})

            await expect(
                service.requestPipelineRun({source: 'script', notify: true})
            ).rejects.toThrow('CI_AUTORUN_PAUSED')
            expect(queue.getQueue()).toEqual([])
        })

        it('answers PIPELINE_EMPTY at request time instead of queueing', async () => {
            vi.mocked(runProcessRegistry.isAnyRunning).mockReturnValue(true)
            stubPipelines({})

            await expect(
                service.requestPipelineRun({source: 'script', notify: true})
            ).rejects.toThrow('PIPELINE_EMPTY')
            expect(queue.getQueue()).toEqual([])
        })

        it('treats the gap between pipeline steps as busy', async () => {
            stubPipelines({develop: [tab('API'), tab('WEB')], production: [tab('Smoke')]})
            const proc1 = createMockProcess()
            let startStep2!: (value: unknown) => void
            mockTestService.runAllTests
                .mockResolvedValueOnce({runId: 'run-1', process: proc1})
                .mockReturnValueOnce(new Promise((resolve) => (startStep2 = resolve)))

            await service.startPipeline(undefined, 'script', 'develop', {notify: true})
            await flushPromises()
            proc1.emit('close', 0)
            await flushPromises()

            // Step 1 is closed and untracked, step 2 has not spawned yet.
            expect(runProcessRegistry.isAnyRunning()).toBe(false)
            expect(queue.isBusy()).toBe(true)
            await expect(service.startPipeline(undefined, 'script')).rejects.toThrow(
                'TESTS_ALREADY_RUNNING'
            )
            const queued = await service.requestPipelineRun({
                source: 'script',
                notify: true,
                pipeline: 'production',
            })
            expect(queued.status).toBe('queued')

            startStep2({runId: 'run-2', process: createMockProcess()})
        })

        it('treats a run that is still starting (before discovery finishes) as busy', async () => {
            const release = queue.beginStarting()

            await expect(service.startPipeline(undefined, 'script')).rejects.toThrow(
                'TESTS_ALREADY_RUNNING'
            )
            const queued = await service.requestPipelineRun({source: 'script', notify: true})
            expect(queued.status).toBe('queued')

            release()
            expect(queue.isBusy()).toBe(false)
        })

        it('drains a queued request when a start claim ends without a process', async () => {
            stubRuns()
            const release = queue.beginStarting() // e.g. a run whose discovery or spawn then fails
            const queued = await service.requestPipelineRun({source: 'script', notify: true})
            expect(queued.status).toBe('queued')

            release()
            await flushPromises()

            expect(mockTestService.runAllTests).toHaveBeenCalledTimes(1)
            expect(queue.getQueue()).toEqual([])
        })

        it('refuses a manual pipeline start while a CI request is queued', async () => {
            vi.mocked(runProcessRegistry.isAnyRunning).mockReturnValue(true)
            await service.requestPipelineRun({source: 'script', notify: true})
            vi.mocked(runProcessRegistry.isAnyRunning).mockReturnValue(false)

            await expect(service.startPipeline()).rejects.toThrow('CI_RUN_QUEUED')
            expect(mockTestService.runAllTests).not.toHaveBeenCalled()
        })

        it('exposes the queue through getQueue()', async () => {
            vi.mocked(runProcessRegistry.isAnyRunning).mockReturnValue(true)
            await service.requestPipelineRun({source: 'script', notify: true})

            expect(service.getQueue()).toEqual(queue.getQueue())
            expect(service.getQueue()).toHaveLength(1)
        })
    })

    describe('queue drain', () => {
        beforeEach(() => {
            stubPipelines({develop: [tab('API')], production: [tab('Smoke')]})
            mockRunRepository.getTestRun.mockResolvedValue(runOk())
        })

        it('starts the production slot before the develop slot when a pipeline finishes', async () => {
            const procs = stubRuns()
            // No notify: a notify run of the same pipeline would be replaced, not waited for.
            await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()

            await service.requestPipelineRun({source: 'script', notify: true, pipeline: 'develop'})
            await service.requestPipelineRun({
                source: 'script',
                notify: true,
                pipeline: 'production',
            })
            expect(queue.getQueue()).toHaveLength(2)

            procs[0].emit('close', 0)
            await flushPromises()

            // production starts first; develop keeps waiting behind it
            expect(mockTestService.runAllTests).toHaveBeenNthCalledWith(
                2,
                undefined,
                false,
                'Smoke',
                'script',
                {pipelineStep: true}
            )
            expect(service.getCurrentPipeline()?.pipeline).toBe('production')
            expect(queue.getQueue().map((q) => q.pipeline)).toEqual(['develop'])

            procs[1].emit('close', 0)
            await flushPromises()

            expect(mockTestService.runAllTests).toHaveBeenNthCalledWith(
                3,
                undefined,
                false,
                'API',
                'script',
                {pipelineStep: true}
            )
            expect(service.getCurrentPipeline()?.pipeline).toBe('develop')
            expect(queue.getQueue()).toEqual([])
            // queued requests ran with notify, so their results are posted
            expect(service.getCurrentPipeline()?.notify).toBe(true)
        })

        it('drains when a non-pipeline run closes (requestDrain from the run close handler)', async () => {
            vi.mocked(runProcessRegistry.isAnyRunning).mockReturnValue(true)
            stubRuns()
            await service.requestPipelineRun({source: 'script', notify: true})

            queue.requestDrain()
            await flushPromises()
            expect(mockTestService.runAllTests).not.toHaveBeenCalled()

            vi.mocked(runProcessRegistry.isAnyRunning).mockReturnValue(false)
            queue.requestDrain()
            await flushPromises()

            expect(mockTestService.runAllTests).toHaveBeenCalledTimes(1)
            expect(queue.getQueue()).toEqual([])
        })

        it('never drains between pipeline steps', async () => {
            stubPipelines({develop: [tab('API'), tab('WEB')], production: [tab('Smoke')]})
            const procs = stubRuns()
            await service.startPipeline(undefined, 'script', 'develop', {notify: true})
            await flushPromises()
            await service.requestPipelineRun({
                source: 'script',
                notify: true,
                pipeline: 'production',
            })

            procs[0].emit('close', 0)
            queue.requestDrain() // what a step's close handler would do
            await flushPromises()

            expect(queue.getQueue()).toHaveLength(1)
            expect(mockTestService.runAllTests.mock.calls.map((c: any[]) => c[2])).toEqual([
                'API',
                'WEB',
            ])
        })

        it('drops a queued request with the paused message when auto-run is paused at drain', async () => {
            const procs = stubRuns()
            await service.startPipeline(undefined, 'script', 'develop', {notify: true})
            await flushPromises()
            await service.requestPipelineRun({
                source: 'script',
                notify: true,
                pipeline: 'production',
            })
            mockSettingsService.getCIAutoRunPause.mockResolvedValue({paused: true, resumeAt: null})

            procs[0].emit('close', 0)
            await flushPromises()

            expect(mockNotifier.notifyPaused).toHaveBeenCalledWith(
                'production',
                'CI auto-run is paused'
            )
            expect(queue.getQueue()).toEqual([])
            expect(mockTestService.runAllTests).toHaveBeenCalledTimes(1)
        })

        it('drops a queued request with pipeline_empty when its tabs were removed meanwhile', async () => {
            const procs = stubRuns()
            await service.startPipeline(undefined, 'script', 'develop', {notify: true})
            await flushPromises()
            await service.requestPipelineRun({
                source: 'script',
                notify: true,
                pipeline: 'production',
            })
            stubPipelines({develop: [tab('API')]})

            procs[0].emit('close', 0)
            await flushPromises()

            expect(mockNotifier.notifyNotStarted).toHaveBeenCalledWith(
                'production',
                'pipeline_empty',
                expect.stringContaining('production')
            )
            expect(queue.getQueue()).toEqual([])
        })

        it('keeps draining after a dropped request', async () => {
            const procs = stubRuns()
            await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()
            await service.requestPipelineRun({
                source: 'script',
                notify: true,
                pipeline: 'production',
            })
            await service.requestPipelineRun({source: 'script', notify: true, pipeline: 'develop'})
            stubPipelines({develop: [tab('API')]}) // production emptied

            procs[0].emit('close', 0)
            await flushPromises()

            expect(mockNotifier.notifyNotStarted).toHaveBeenCalledTimes(1)
            expect(service.getCurrentPipeline()?.pipeline).toBe('develop')
        })

        it('puts the request back when something else started in the meantime', async () => {
            vi.mocked(runProcessRegistry.isAnyRunning).mockReturnValue(true)
            await service.requestPipelineRun({source: 'script', notify: true, maxWorkers: 2})
            vi.mocked(runProcessRegistry.isAnyRunning).mockReturnValue(false)
            vi.spyOn(service, 'startPipeline').mockRejectedValueOnce(
                new Error(JSON.stringify({code: 'TESTS_ALREADY_RUNNING', message: 'busy'}))
            )

            queue.requestDrain()
            await flushPromises()

            expect(queue.getQueue()).toEqual([
                expect.objectContaining({pipeline: 'develop', maxWorkers: 2}),
            ])
            expect(mockNotifier.notifyNotStarted).not.toHaveBeenCalled()
        })

        it('does not start a second pipeline while the first still runs', async () => {
            stubRuns()
            await service.startPipeline(undefined, 'script', 'develop', {notify: true})
            await flushPromises()
            await service.requestPipelineRun({
                source: 'script',
                notify: true,
                pipeline: 'production',
            })

            queue.requestDrain()
            await flushPromises()

            expect(mockTestService.runAllTests).toHaveBeenCalledTimes(1)
            expect(queue.getQueue()).toHaveLength(1)
        })
    })

    describe('result notification', () => {
        beforeEach(() => {
            stubPipelines({
                develop: [tab('API', {stopPipelineOnFailure: true}), tab('WEB')],
            })
        })

        it('posts the result when the request asked for it', async () => {
            const procs = stubRuns()
            mockRunRepository.getTestRun.mockResolvedValue(runOk())

            await service.startPipeline(undefined, 'script', 'develop', {notify: true})
            await flushPromises()
            procs[0].emit('close', 0)
            await flushPromises()
            procs[1].emit('close', 0)
            await flushPromises()

            expect(mockNotifier.notifyResult).toHaveBeenCalledTimes(1)
            expect(mockNotifier.notifyResult).toHaveBeenCalledWith(
                'develop',
                'completed',
                expect.arrayContaining([expect.objectContaining({project: 'API'})])
            )
        })

        it('stays silent without notify (--wait callers get the result from the script)', async () => {
            const procs = stubRuns()
            mockRunRepository.getTestRun.mockResolvedValue(runOk())

            await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()
            procs[0].emit('close', 0)
            await flushPromises()
            procs[1].emit('close', 0)
            await flushPromises()

            expect(service.getCurrentPipeline()?.status).toBe('completed')
            expect(mockNotifier.notifyResult).not.toHaveBeenCalled()
        })

        it('posts stopped_early when a blocking step fails', async () => {
            const procs = stubRuns()
            mockRunRepository.getTestRun.mockResolvedValue(runOk(1, 2))

            await service.startPipeline(undefined, 'script', 'develop', {notify: true})
            await flushPromises()
            procs[0].emit('close', 1)
            await flushPromises()

            expect(mockNotifier.notifyResult).toHaveBeenCalledWith(
                'develop',
                'stopped_early',
                expect.any(Array)
            )
        })

        it('keeps a finished pipeline readable after the next one started (--wait pollers)', async () => {
            stubPipelines({develop: [tab('API')], production: [tab('Smoke')]})
            const procs = stubRuns()
            mockRunRepository.getTestRun.mockResolvedValue(runOk())
            const first = await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()
            await service.requestPipelineRun({
                source: 'script',
                notify: true,
                pipeline: 'production',
            })

            procs[0].emit('close', 0)
            await flushPromises()

            expect(service.getCurrentPipeline()?.pipeline).toBe('production')
            expect(service.getPipeline(first.pipelineRunId)?.status).toBe('completed')
        })

        it('posts once even when the finish broadcast throws after the pipeline ended', async () => {
            stubPipelines({develop: [tab('API')]})
            const procs = stubRuns()
            mockRunRepository.getTestRun.mockResolvedValue(runOk())
            mockWebSocketService.broadcastPipelineCompleted.mockImplementationOnce(() => {
                throw new Error('ws down')
            })

            await service.startPipeline(undefined, 'script', 'develop', {notify: true})
            await flushPromises()
            procs[0].emit('close', 0)
            await flushPromises()

            expect(mockNotifier.notifyResult).toHaveBeenCalledTimes(1)
        })

        it('survives a failing notifier without breaking the pipeline', async () => {
            const procs = stubRuns()
            mockRunRepository.getTestRun.mockResolvedValue(runOk())
            mockNotifier.notifyResult.mockRejectedValue(new Error('slack down'))

            await service.startPipeline(undefined, 'script', 'develop', {notify: true})
            await flushPromises()
            procs[0].emit('close', 0)
            await flushPromises()
            procs[1].emit('close', 0)
            await flushPromises()

            expect(service.getCurrentPipeline()?.status).toBe('completed')
        })
    })

    describe('auto-run paused while a pipeline runs', () => {
        beforeEach(() => {
            stubPipelines({
                develop: [tab('API'), tab('WEB'), tab('MOBILE')],
                production: [tab('Smoke')],
            })
            mockRunRepository.getTestRun.mockResolvedValue(runOk())
        })

        const pause = () =>
            mockSettingsService.getCIAutoRunPause.mockResolvedValue({paused: true, resumeAt: null})

        it('lets the running step finish, skips the rest without failing a step, and ends paused', async () => {
            const procs = stubRuns()
            const pipeline = await service.startPipeline(undefined, 'script', 'develop', {
                notify: true,
            })
            await flushPromises()
            pause()
            procs[0].emit('close', 0)
            await flushPromises()

            const state = service.getPipeline(pipeline.pipelineRunId)
            expect(state?.status).toBe('paused')
            expect(state?.steps.map((st) => st.status)).toEqual(['success', 'skipped', 'skipped'])
            expect(mockTestService.runAllTests).toHaveBeenCalledTimes(1)
            expect(mockWebSocketService.broadcastPipelineCompleted).toHaveBeenCalledWith(
                pipeline.pipelineRunId,
                'paused',
                expect.any(Array)
            )
            expect(mockNotifier.notifyResult).toHaveBeenCalledWith(
                'develop',
                'paused',
                expect.arrayContaining([
                    expect.objectContaining({project: 'API', status: 'success'}),
                ])
            )
            expect(mockSettingsService.clearInFlightPipeline).toHaveBeenCalledTimes(1)
            expect(queue.isBusy()).toBe(false)
        })

        it('does not read a pause that hits between the check and the spawn as a failed step', async () => {
            const procs = stubRuns()
            const pipeline = await service.startPipeline(undefined, 'script', 'develop', {
                notify: true,
            })
            await flushPromises()
            mockTestService.runAllTests.mockRejectedValueOnce(
                new Error(
                    JSON.stringify({code: 'CI_AUTORUN_PAUSED', message: 'CI auto-run is paused'})
                )
            )
            procs[0].emit('close', 0)
            await flushPromises()

            const state = service.getPipeline(pipeline.pipelineRunId)
            expect(state?.status).toBe('paused')
            expect(state?.steps.map((st) => st.status)).toEqual(['success', 'skipped', 'skipped'])
        })

        it('keeps stopped_early when the finished step failed on a blocking step', async () => {
            stubPipelines({develop: [tab('API', {stopPipelineOnFailure: true}), tab('WEB')]})
            const procs = stubRuns()
            mockRunRepository.getTestRun.mockResolvedValue(runOk(1, 2))
            await service.startPipeline(undefined, 'script', 'develop', {notify: true})
            await flushPromises()
            pause()
            procs[0].emit('close', 1)
            await flushPromises()

            expect(service.getCurrentPipeline()?.status).toBe('stopped_early')
        })

        it('continues once an elapsed resumeAt auto-resumes the pause', async () => {
            const procs = stubRuns()
            await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()
            mockSettingsService.getCIAutoRunPause.mockResolvedValue({
                paused: true,
                resumeAt: new Date(Date.now() - 1000).toISOString(),
            })
            procs[0].emit('close', 0)
            await flushPromises()

            expect(mockTestService.runAllTests).toHaveBeenCalledTimes(2)
            expect(service.getCurrentPipeline()?.status).toBe('running')
        })

        it('carries on as not paused when the pause setting cannot be read between steps', async () => {
            const procs = stubRuns()
            const pipeline = await service.startPipeline(undefined, 'script', 'develop', {
                notify: true,
            })
            await flushPromises()
            mockSettingsService.getCIAutoRunPause.mockRejectedValue(new Error('db locked'))
            procs[0].emit('close', 0)
            await flushPromises()

            const state = service.getPipeline(pipeline.pipelineRunId)
            expect(state?.status).toBe('running')
            expect(state?.steps.map((st) => st.status)).toEqual(['success', 'running', 'queued'])
            expect(mockTestService.runAllTests).toHaveBeenCalledTimes(2)
            expect(mockNotifier.notifyResult).not.toHaveBeenCalled()
        })

        it('fails the step (not "unknown tab") when its own start then hits the same read error', async () => {
            const procs = stubRuns()
            const pipeline = await service.startPipeline(undefined, 'script', 'develop', {
                notify: true,
            })
            await flushPromises()
            mockSettingsService.getCIAutoRunPause.mockRejectedValue(new Error('db locked'))
            mockTestService.runAllTests.mockRejectedValueOnce(new Error('db locked'))
            procs[0].emit('close', 0)
            await flushPromises()

            const state = service.getPipeline(pipeline.pipelineRunId)
            expect(state?.status).toBe('stopped_early')
            expect(state?.steps.map((st) => st.status)).toEqual(['success', 'failed', 'skipped'])
        })

        it('does not apply to pipelines that were not started by a script', async () => {
            const procs = stubRuns()
            await service.startPipeline(undefined, undefined, 'develop')
            await flushPromises()
            pause()
            procs[0].emit('close', 0)
            await flushPromises()

            expect(mockTestService.runAllTests).toHaveBeenCalledTimes(2)
        })

        it('drains the next queued request after a paused finish, which is then dropped as paused', async () => {
            const procs = stubRuns()
            await service.startPipeline(undefined, 'script', 'develop', {notify: true})
            await flushPromises()
            await service.requestPipelineRun({
                source: 'script',
                notify: true,
                pipeline: 'production',
            })
            pause()
            procs[0].emit('close', 0)
            await flushPromises()

            expect(service.getPipeline(service.getCurrentPipeline()!.pipelineRunId)?.status).toBe(
                'paused'
            )
            expect(mockNotifier.notifyPaused).toHaveBeenCalledWith(
                'production',
                'CI auto-run is paused'
            )
        })
    })

    describe('fast-exiting child', () => {
        beforeEach(() => {
            stubPipelines({develop: [tab('API')]})
            mockRunRepository.getTestRun.mockResolvedValue(runOk())
        })

        it('still finishes when the process closes before the marker write resolves', async () => {
            const procs = stubRuns()
            let resolveMarker!: () => void
            mockSettingsService.setInFlightPipeline
                .mockResolvedValueOnce(undefined) // pipeline start
                .mockReturnValueOnce(new Promise<void>((resolve) => (resolveMarker = resolve))) // after spawn

            const pipeline = await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()
            procs[0].emit('close', 1) // closes while the step marker write is pending
            resolveMarker()
            await flushPromises()

            expect(service.getPipeline(pipeline.pipelineRunId)?.status).toBe('completed')
            expect(queue.isBusy()).toBe(false)
        })

        it('treats a child that already has an exit code as closed', async () => {
            const proc = createMockProcess()
            proc.exitCode = 1
            mockTestService.runAllTests.mockResolvedValue({runId: 'run-1', process: proc})

            const pipeline = await service.startPipeline()
            await flushPromises()

            expect(service.getPipeline(pipeline.pipelineRunId)?.status).toBe('completed')
        })

        it('treats a child killed by a signal as closed', async () => {
            const proc = createMockProcess()
            proc.signalCode = 'SIGKILL'
            mockTestService.runAllTests.mockResolvedValue({runId: 'run-1', process: proc})

            const pipeline = await service.startPipeline()
            await flushPromises()

            expect(service.getPipeline(pipeline.pipelineRunId)?.status).toBe('completed')
        })
    })

    describe('crashed step', () => {
        beforeEach(() => {
            stubPipelines({develop: [tab('API'), tab('WEB')]})
        })

        it('fails the step and stops the pipeline when the run row is still running after close', async () => {
            const procs = stubRuns()
            mockRunRepository.getTestRun.mockResolvedValue({
                status: 'running',
                passedTests: 0,
                failedTests: 0,
            })

            const pipeline = await service.startPipeline(undefined, 'script', 'develop', {
                notify: true,
            })
            await flushPromises()
            procs[0].emit('close', 1)
            await flushPromises()

            const state = service.getPipeline(pipeline.pipelineRunId)
            expect(state?.status).toBe('stopped_early')
            expect(state?.steps.map((s) => s.status)).toEqual(['failed', 'skipped'])
            expect(mockTestService.runAllTests).toHaveBeenCalledTimes(1)
            expect(mockWebSocketService.broadcastPipelineStepCompleted).toHaveBeenCalledWith(
                pipeline.pipelineRunId,
                expect.objectContaining({project: 'API', status: 'failed'})
            )
            expect(mockNotifier.notifyResult).toHaveBeenCalledWith(
                'develop',
                'stopped_early',
                expect.arrayContaining([
                    expect.objectContaining({project: 'API', status: 'failed'}),
                ])
            )
        })

        it('does not read a finished 0/0 run as a crash', async () => {
            const procs = stubRuns()
            mockRunRepository.getTestRun.mockResolvedValue(runOk(0, 0))

            const pipeline = await service.startPipeline()
            await flushPromises()
            procs[0].emit('close', 0)
            await flushPromises()

            expect(service.getPipeline(pipeline.pipelineRunId)?.steps[0].status).toBe('success')
        })
    })

    describe('watchdog', () => {
        beforeEach(() => {
            // setImmediate stays real so flushPromises keeps working
            vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
            stubPipelines({develop: [tab('API'), tab('WEB')]})
            mockRunRepository.getTestRun.mockResolvedValue(runOk())
        })

        afterEach(() => {
            vi.useRealTimers()
            delete process.env.CI_PIPELINE_TIMEOUT_MINUTES
        })

        it('posts the timeout once after 30 minutes by default, asks for a stop with reason timeout, and skips the result message', async () => {
            // The stop itself is covered in pipelineStop.service.test.ts; here it is a spy.
            const stop = vi.spyOn(service, 'stop').mockResolvedValue({stopped: true, runIds: []})
            const procs = stubRuns()
            await service.startPipeline(undefined, 'script', 'develop', {notify: true})
            await flushPromises()

            vi.advanceTimersByTime(29 * 60 * 1000)
            expect(mockNotifier.notifyTimeout).not.toHaveBeenCalled()
            expect(stop).not.toHaveBeenCalled()

            vi.advanceTimersByTime(60 * 1000)
            expect(mockNotifier.notifyTimeout).toHaveBeenCalledTimes(1)
            expect(mockNotifier.notifyTimeout).toHaveBeenCalledWith('develop', ['API', 'WEB'])
            expect(stop).toHaveBeenCalledWith('timeout')
            expect(service.getCurrentPipeline()?.status).toBe('running')

            vi.advanceTimersByTime(60 * 60 * 1000)
            expect(mockNotifier.notifyTimeout).toHaveBeenCalledTimes(1)
            expect(stop).toHaveBeenCalledTimes(1)

            // with the stop mocked the pipeline still waits for the real end, but no result message follows
            procs[0].emit('close', 0)
            await flushPromises()
            procs[1].emit('close', 0)
            await flushPromises()
            expect(service.getCurrentPipeline()?.status).toBe('completed')
            expect(mockNotifier.notifyResult).not.toHaveBeenCalled()
        })

        it('uses CI_PIPELINE_TIMEOUT_MINUTES', async () => {
            process.env.CI_PIPELINE_TIMEOUT_MINUTES = '5'
            stubRuns()
            await service.startPipeline(undefined, 'script', 'develop', {notify: true})
            await flushPromises()

            vi.advanceTimersByTime(5 * 60 * 1000)

            expect(mockNotifier.notifyTimeout).toHaveBeenCalledTimes(1)
        })

        it('does not fire when the pipeline finishes in time', async () => {
            const procs = stubRuns()
            await service.startPipeline(undefined, 'script', 'develop', {notify: true})
            await flushPromises()
            procs[0].emit('close', 0)
            await flushPromises()
            procs[1].emit('close', 0)
            await flushPromises()

            vi.advanceTimersByTime(60 * 60 * 1000)

            expect(mockNotifier.notifyTimeout).not.toHaveBeenCalled()
            expect(mockNotifier.notifyResult).toHaveBeenCalledTimes(1)
        })

        it('is off for requests without notify', async () => {
            stubRuns()
            await service.startPipeline(undefined, 'script', 'develop')
            await flushPromises()

            vi.advanceTimersByTime(60 * 60 * 1000)

            expect(mockNotifier.notifyTimeout).not.toHaveBeenCalled()
        })
    })

    describe('in-flight marker and restart', () => {
        beforeEach(() => {
            stubPipelines({develop: [tab('API'), tab('WEB')], production: [tab('Smoke')]})
            mockRunRepository.getTestRun.mockResolvedValue(runOk())
        })

        it('writes the marker on start and after each step starts, clears it on finish', async () => {
            const procs = stubRuns()
            await service.startPipeline(undefined, 'script', 'develop', {notify: true})
            await flushPromises()

            expect(mockSettingsService.setInFlightPipeline).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    pipeline: 'develop',
                    source: 'script',
                    notify: true,
                    runIds: ['run-1'],
                    projects: ['API', 'WEB'],
                })
            )
            expect(mockSettingsService.setInFlightPipeline.mock.calls[0][0].runIds).toEqual([])

            procs[0].emit('close', 0)
            await flushPromises()
            expect(mockSettingsService.setInFlightPipeline).toHaveBeenLastCalledWith(
                expect.objectContaining({runIds: ['run-1', 'run-2']})
            )
            expect(mockSettingsService.clearInFlightPipeline).not.toHaveBeenCalled()

            procs[1].emit('close', 0)
            await flushPromises()
            expect(mockSettingsService.clearInFlightPipeline).toHaveBeenCalledTimes(1)
        })

        it('clears the old marker before a drained pipeline writes its own', async () => {
            const procs = stubRuns()
            await service.startPipeline(undefined, 'script', 'production', {notify: true})
            await flushPromises()
            await service.requestPipelineRun({source: 'script', notify: true, pipeline: 'develop'})
            mockSettingsService.setInFlightPipeline.mockClear()

            procs[0].emit('close', 0)
            await flushPromises()

            const clearOrder = mockSettingsService.clearInFlightPipeline.mock.invocationCallOrder[0]
            const nextWriteOrder =
                mockSettingsService.setInFlightPipeline.mock.invocationCallOrder[0]
            expect(clearOrder).toBeLessThan(nextWriteOrder)
        })

        it('still runs the pipeline when the marker cannot be written', async () => {
            const procs = stubRuns()
            mockSettingsService.setInFlightPipeline.mockRejectedValue(new Error('db locked'))

            const pipeline = await service.startPipeline()
            await flushPromises()
            procs[0].emit('close', 0)
            await flushPromises()
            procs[1].emit('close', 0)
            await flushPromises()

            expect(service.getPipeline(pipeline.pipelineRunId)?.status).toBe('completed')
        })

        it('on startup posts the interrupted message for a notify marker and clears it', async () => {
            mockSettingsService.getInFlightPipeline.mockResolvedValue({
                pipeline: 'production',
                source: 'script',
                notify: true,
                startedAt: '2026-01-01T00:00:00.000Z',
                runIds: ['run-1'],
                projects: ['Smoke'],
                pgids: [],
            })

            await service.handleInterruptedOnStartup()

            expect(mockNotifier.notifyInterrupted).toHaveBeenCalledWith('production', ['Smoke'])
            expect(mockSettingsService.clearInFlightPipeline).toHaveBeenCalledTimes(1)
            expect(mockTestService.runAllTests).not.toHaveBeenCalled()
        })

        it('on startup clears a marker without posting when the run did not ask for Slack', async () => {
            mockSettingsService.getInFlightPipeline.mockResolvedValue({
                pipeline: 'develop',
                source: 'script',
                notify: false,
                startedAt: '2026-01-01T00:00:00.000Z',
                runIds: [],
                projects: ['API'],
                pgids: [],
            })

            await service.handleInterruptedOnStartup()

            expect(mockNotifier.notifyInterrupted).not.toHaveBeenCalled()
            expect(mockSettingsService.clearInFlightPipeline).toHaveBeenCalledTimes(1)
        })

        it('on startup does nothing without a marker', async () => {
            await service.handleInterruptedOnStartup()

            expect(mockNotifier.notifyInterrupted).not.toHaveBeenCalled()
            expect(mockSettingsService.clearInFlightPipeline).not.toHaveBeenCalled()
        })

        it('on startup never throws when reading the marker fails', async () => {
            mockSettingsService.getInFlightPipeline.mockRejectedValue(new Error('db gone'))

            await expect(service.handleInterruptedOnStartup()).resolves.toBeUndefined()
        })
    })
})

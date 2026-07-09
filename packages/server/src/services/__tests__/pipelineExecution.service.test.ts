import {describe, it, expect, vi, beforeEach} from 'vitest'
import {EventEmitter} from 'events'
import {PipelineExecutionService} from '../pipelineExecution.service'

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

function flushPromises() {
    return new Promise((resolve) => setImmediate(resolve))
}

function createMockProcess() {
    return new EventEmitter() as any
}

describe('PipelineExecutionService', () => {
    let service: PipelineExecutionService
    let mockTestService: any
    let mockSettingsService: any
    let mockRunRepository: any
    let mockWebSocketService: any

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(activeProcessesTracker.isAnyProcessRunning).mockReturnValue(false)
        vi.mocked(activeProcessesTracker.getActiveProcesses).mockReturnValue([])

        mockTestService = {runAllTests: vi.fn()}
        mockSettingsService = {
            getCIAutoRunPause: vi.fn().mockResolvedValue({paused: false, resumeAt: null}),
            setCIAutoRunPause: vi.fn(),
            getPipelineSteps: vi.fn().mockResolvedValue([]),
        }
        mockRunRepository = {getTestRun: vi.fn()}
        mockWebSocketService = {
            broadcastPipelineStarted: vi.fn(),
            broadcastPipelineStepStarted: vi.fn(),
            broadcastPipelineStepCompleted: vi.fn(),
            broadcastPipelineCompleted: vi.fn(),
        }

        service = new PipelineExecutionService(
            mockTestService,
            mockSettingsService,
            mockRunRepository,
            mockWebSocketService
        )
    })

    describe('startPipeline() guard checks', () => {
        it('throws PIPELINE_EMPTY when no tabs are configured to run in the pipeline', async () => {
            mockSettingsService.getPipelineSteps.mockResolvedValue([])

            await expect(service.startPipeline()).rejects.toThrow('PIPELINE_EMPTY')
            expect(mockTestService.runAllTests).not.toHaveBeenCalled()
        })

        it('throws TESTS_ALREADY_RUNNING when a process is already active', async () => {
            vi.mocked(activeProcessesTracker.isAnyProcessRunning).mockReturnValue(true)
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
                undefined
            )

            proc1.emit('close', 0)
            await flushPromises()

            expect(mockTestService.runAllTests).toHaveBeenNthCalledWith(
                2,
                2,
                false,
                'All_Tests',
                undefined
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

    describe('getPipeline() / getCurrentPipeline()', () => {
        it('returns null for an unknown pipelineRunId', () => {
            expect(service.getPipeline('unknown')).toBeNull()
        })

        it('returns null when no pipeline has ever run', () => {
            expect(service.getCurrentPipeline()).toBeNull()
        })
    })
})

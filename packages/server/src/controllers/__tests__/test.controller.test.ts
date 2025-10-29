import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {TestController} from '../test.controller'
import type {ServiceRequest} from '../../types/api.types'
import type {Response} from 'express'
import {ResponseHelper} from '../../utils/response.helper'
import {Logger} from '../../utils/logger.util'

// Mock all dependencies
vi.mock('../../services/test.service')
vi.mock('../../services/auth.service')
vi.mock('../../utils/response.helper')
vi.mock('../../utils/logger.util', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
}))
vi.mock('../../services/activeProcesses.service', () => ({
    activeProcessesTracker: {
        addProcess: vi.fn(),
        removeProcess: vi.fn(),
        isProcessRunning: vi.fn(),
        getConnectionStatus: vi.fn(),
        forceReset: vi.fn(),
        updateProgress: vi.fn().mockReturnValue(null),
        getProgress: vi.fn(),
        startTest: vi.fn(),
    },
}))
vi.mock('../../websocket/server', () => ({
    getWebSocketManager: vi.fn(),
}))

// Import after mocking
import {activeProcessesTracker} from '../../services/activeProcesses.service'
import {getWebSocketManager} from '../../websocket/server'

describe('TestController', () => {
    let controller: TestController
    let mockTestService: any
    let mockAuthService: any
    let mockReq: Partial<ServiceRequest>
    let mockRes: Partial<Response>

    // Helper function to create mock request
    const createMockRequest = (overrides: Partial<ServiceRequest> = {}): ServiceRequest => {
        return {
            body: {},
            params: {},
            query: {},
            ...overrides,
        } as ServiceRequest
    }

    // Helper function to create mock response
    const createMockResponse = (): Response => {
        const res: any = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            send: vi.fn().mockReturnThis(),
            setHeader: vi.fn().mockReturnThis(),
            sendFile: vi.fn(),
            headersSent: false,
        }
        return res
    }

    beforeEach(() => {
        // Clear all mocks
        vi.clearAllMocks()

        // Setup mock services
        mockTestService = {
            discoverTests: vi.fn(),
            runAllTests: vi.fn(),
            runTestGroup: vi.fn(),
            getAllTests: vi.fn(),
            getTestStats: vi.fn(),
            getFlakyTests: vi.fn(),
            getTestTimeline: vi.fn(),
            deleteTest: vi.fn(),
            clearAllTests: vi.fn(),
            saveTestResult: vi.fn(),
            getTestById: vi.fn(),
            rerunTest: vi.fn(),
            getTestHistory: vi.fn(),
            getDiagnostics: vi.fn(),
            getTraceFileById: vi.fn(),
        }

        mockAuthService = {
            verifyJWT: vi.fn(),
        }

        // Create controller instance
        controller = new TestController(mockTestService, mockAuthService)

        // Setup default request and response
        mockReq = createMockRequest()
        mockRes = createMockResponse()

        // Setup ResponseHelper mocks with proper return values
        vi.mocked(ResponseHelper.success).mockImplementation((res: Response) => res)
        vi.mocked(ResponseHelper.badRequest).mockImplementation((res: Response) => res)
        vi.mocked(ResponseHelper.notFound).mockImplementation((res: Response) => res)
        vi.mocked(ResponseHelper.error).mockImplementation((res: Response) => res)
        vi.mocked(ResponseHelper.unauthorized).mockImplementation((res: Response) => res)
        vi.mocked(ResponseHelper.serverError).mockImplementation((res: Response) => res)
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    describe('discoverTests', () => {
        it('should discover tests successfully', async () => {
            const discoveryResult = {discovered: 10, saved: 10, timestamp: '2025-01-01T00:00:00Z'}
            mockTestService.discoverTests.mockResolvedValue(discoveryResult)

            await controller.discoverTests(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.discoverTests).toHaveBeenCalledTimes(1)
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, discoveryResult)
            expect(Logger.error).not.toHaveBeenCalled()
        })

        it('should handle discovery errors', async () => {
            const error = new Error('Discovery failed')
            mockTestService.discoverTests.mockRejectedValue(error)

            await controller.discoverTests(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith('Error during test discovery', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Discovery failed',
                'Test discovery failed',
                500
            )
        })

        it('should handle non-Error exceptions', async () => {
            mockTestService.discoverTests.mockRejectedValue('String error')

            await controller.discoverTests(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Unknown error',
                'Test discovery failed',
                500
            )
        })
    })

    describe('runAllTests', () => {
        it('should run all tests with maxWorkers', async () => {
            const runResult = {runId: 'run-123', message: 'Tests started'}
            mockReq.body = {maxWorkers: 4}
            mockTestService.runAllTests.mockResolvedValue(runResult)

            await controller.runAllTests(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.runAllTests).toHaveBeenCalledWith(4)
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, runResult)
        })

        it('should run all tests without maxWorkers', async () => {
            const runResult = {runId: 'run-123', message: 'Tests started'}
            mockTestService.runAllTests.mockResolvedValue(runResult)

            await controller.runAllTests(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.runAllTests).toHaveBeenCalledWith(undefined)
        })

        it('should handle tests already running error (409)', async () => {
            const errorData = {
                code: 'TESTS_ALREADY_RUNNING',
                message: 'Tests are already running',
                currentRunId: 'existing-run-123',
                estimatedTimeRemaining: 120,
                startedAt: '2025-10-26T10:00:00.000Z',
            }
            const error = new Error(JSON.stringify(errorData))
            mockTestService.runAllTests.mockRejectedValue(error)

            await controller.runAllTests(mockReq as ServiceRequest, mockRes as Response)

            expect(mockRes.status).toHaveBeenCalledWith(409)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Tests are already running',
                    code: 'TESTS_ALREADY_RUNNING',
                    currentRunId: 'existing-run-123',
                    estimatedTimeRemaining: 120,
                    startedAt: '2025-10-26T10:00:00.000Z',
                })
            )
        })

        it('should handle malformed already running error gracefully', async () => {
            const error = new Error('Some TESTS_ALREADY_RUNNING error without JSON')
            mockTestService.runAllTests.mockRejectedValue(error)

            await controller.runAllTests(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Tests are already running',
                'Tests are already running',
                409
            )
        })

        it('should handle errors when running tests', async () => {
            const error = new Error('Failed to start tests')
            mockTestService.runAllTests.mockRejectedValue(error)

            await controller.runAllTests(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith('Error running all tests', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Failed to start tests',
                'Failed to run all tests',
                500
            )
        })
    })

    describe('runTestGroup', () => {
        it('should run test group with filePath', async () => {
            const runResult = {runId: 'run-123', message: 'Group tests started'}
            mockReq.body = {filePath: 'tests/example.spec.ts', maxWorkers: 2}
            mockTestService.runTestGroup.mockResolvedValue(runResult)

            await controller.runTestGroup(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.runTestGroup).toHaveBeenCalledWith(
                'tests/example.spec.ts',
                2,
                undefined
            )
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, runResult)
        })

        it('should return bad request when filePath is missing', async () => {
            mockReq.body = {}

            await controller.runTestGroup(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                mockRes,
                'Missing filePath parameter'
            )
            expect(mockTestService.runTestGroup).not.toHaveBeenCalled()
        })

        it('should handle errors when running group', async () => {
            const error = new Error('Group execution failed')
            mockReq.body = {filePath: 'tests/example.spec.ts'}
            mockTestService.runTestGroup.mockRejectedValue(error)

            await controller.runTestGroup(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith('Error running group tests', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Group execution failed',
                'Failed to run group tests',
                500
            )
        })
    })

    describe('getAllTests', () => {
        it('should get all tests without filters', async () => {
            const tests = [{id: '1', name: 'Test 1'}]
            mockTestService.getAllTests.mockResolvedValue(tests)

            await controller.getAllTests(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.getAllTests).toHaveBeenCalledWith({
                runId: undefined,
                status: undefined,
                limit: 100,
            })
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, tests, undefined, 1)
        })

        it('should get all tests with filters', async () => {
            const tests = [{id: '1', name: 'Test 1', status: 'passed'}]
            mockReq.query = {runId: 'run-123', status: 'passed', limit: '50'}
            mockTestService.getAllTests.mockResolvedValue(tests)

            await controller.getAllTests(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.getAllTests).toHaveBeenCalledWith({
                runId: 'run-123',
                status: 'passed',
                limit: 50,
            })
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, tests, undefined, 1)
        })

        it('should handle errors when fetching tests', async () => {
            const error = new Error('Database error')
            mockTestService.getAllTests.mockRejectedValue(error)

            await controller.getAllTests(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith('Error fetching tests', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Failed to fetch tests',
                'Database error',
                500
            )
        })
    })

    describe('getTestStats', () => {
        it('should get test statistics', async () => {
            const stats = {total: 100, passed: 80, failed: 20}
            mockTestService.getTestStats.mockResolvedValue(stats)

            await controller.getTestStats(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.getTestStats).toHaveBeenCalledTimes(1)
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, stats)
        })

        it('should handle errors when fetching stats', async () => {
            const error = new Error('Stats error')
            mockTestService.getTestStats.mockRejectedValue(error)

            await controller.getTestStats(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith('Error fetching stats', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Stats error',
                'Failed to fetch stats',
                500
            )
        })
    })

    describe('getFlakyTests', () => {
        it('should get flaky tests with default parameters', async () => {
            const flakyTests = [{testId: 'test-1', flakyRate: 0.5}]
            mockTestService.getFlakyTests.mockResolvedValue(flakyTests)

            await controller.getFlakyTests(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.getFlakyTests).toHaveBeenCalledWith(30, 10)
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, flakyTests, undefined, 1)
        })

        it('should get flaky tests with custom parameters', async () => {
            const flakyTests = [{testId: 'test-1', flakyRate: 0.7}]
            mockReq.query = {days: '60', threshold: '20'}
            mockTestService.getFlakyTests.mockResolvedValue(flakyTests)

            await controller.getFlakyTests(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.getFlakyTests).toHaveBeenCalledWith(60, 20)
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, flakyTests, undefined, 1)
        })

        it('should handle invalid query parameters', async () => {
            const flakyTests: any[] = []
            mockReq.query = {days: 'invalid', threshold: 'invalid'}
            mockTestService.getFlakyTests.mockResolvedValue(flakyTests)

            await controller.getFlakyTests(mockReq as ServiceRequest, mockRes as Response)

            // Should use defaults when parsing fails
            expect(mockTestService.getFlakyTests).toHaveBeenCalledWith(30, 10)
        })

        it('should handle errors when fetching flaky tests', async () => {
            const error = new Error('Flaky detection error')
            mockTestService.getFlakyTests.mockRejectedValue(error)

            await controller.getFlakyTests(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith('Error fetching flaky tests', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Flaky detection error',
                'Failed to fetch flaky tests',
                500
            )
        })
    })

    describe('getTestTimeline', () => {
        it('should get test timeline with default days', async () => {
            const timeline = [{date: '2025-01-01', passed: 10, failed: 2}]
            mockTestService.getTestTimeline.mockResolvedValue(timeline)

            await controller.getTestTimeline(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.getTestTimeline).toHaveBeenCalledWith(30)
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, timeline, undefined, 1)
        })

        it('should get test timeline with custom days', async () => {
            const timeline = [{date: '2025-01-01', passed: 10, failed: 2}]
            mockReq.query = {days: '60'}
            mockTestService.getTestTimeline.mockResolvedValue(timeline)

            await controller.getTestTimeline(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.getTestTimeline).toHaveBeenCalledWith(60)
        })

        it('should handle errors when fetching timeline', async () => {
            const error = new Error('Timeline error')
            mockTestService.getTestTimeline.mockRejectedValue(error)

            await controller.getTestTimeline(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith('Error fetching test timeline', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Timeline error',
                'Failed to fetch test timeline',
                500
            )
        })
    })

    describe('clearAllTests', () => {
        it('should clear all test data', async () => {
            const statsBefore = {total: 100, passed: 80, failed: 20}
            mockTestService.getTestStats.mockResolvedValue(statsBefore)
            mockTestService.clearAllTests.mockResolvedValue(undefined)

            await controller.clearAllTests(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.getTestStats).toHaveBeenCalledTimes(1)
            expect(mockTestService.clearAllTests).toHaveBeenCalledTimes(1)
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, {
                message: 'All test data cleared successfully',
                statsBefore,
            })
        })

        it('should handle errors when clearing tests', async () => {
            const error = new Error('Clear error')
            mockTestService.getTestStats.mockRejectedValue(error)

            await controller.clearAllTests(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith('Error clearing test data', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Clear error',
                'Failed to clear test data',
                500
            )
        })
    })

    describe('createTestResult', () => {
        it('should create test result with all fields', async () => {
            const testData = {
                id: 'result-1',
                testId: 'test-1',
                runId: 'run-1',
                name: 'Example test',
                filePath: 'test.spec.ts',
                status: 'passed',
                duration: 1000,
                errorMessage: null,
                errorStack: null,
                metadata: {},
                attachments: [],
            }
            mockReq.body = testData
            mockTestService.saveTestResult.mockResolvedValue(undefined)

            await controller.createTestResult(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.saveTestResult).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'result-1',
                    testId: 'test-1',
                    runId: 'run-1',
                    name: 'Example test',
                    filePath: 'test.spec.ts',
                    status: 'passed',
                    duration: 1000,
                    retryCount: 0,
                })
            )
            expect(ResponseHelper.success).toHaveBeenCalledWith(
                mockRes,
                {id: 'result-1'},
                'Test result saved successfully'
            )
        })

        it('should create test result with minimal fields', async () => {
            const testData = {
                id: 'result-1',
                testId: 'test-1',
                runId: 'run-1',
                name: 'Example test',
            }
            mockReq.body = testData
            mockTestService.saveTestResult.mockResolvedValue(undefined)

            await controller.createTestResult(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.saveTestResult).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'result-1',
                    testId: 'test-1',
                    runId: 'run-1',
                    name: 'Example test',
                    filePath: '',
                    status: 'unknown',
                    duration: 0,
                    retryCount: 0,
                })
            )
        })

        it('should return bad request when missing id', async () => {
            mockReq.body = {testId: 'test-1', runId: 'run-1', name: 'Test'}

            await controller.createTestResult(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                mockRes,
                'Missing required fields: id, testId, runId, name'
            )
            expect(mockTestService.saveTestResult).not.toHaveBeenCalled()
        })

        it('should return bad request when missing testId', async () => {
            mockReq.body = {id: 'result-1', runId: 'run-1', name: 'Test'}

            await controller.createTestResult(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.badRequest).toHaveBeenCalled()
            expect(mockTestService.saveTestResult).not.toHaveBeenCalled()
        })

        it('should return bad request when missing runId', async () => {
            mockReq.body = {id: 'result-1', testId: 'test-1', name: 'Test'}

            await controller.createTestResult(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.badRequest).toHaveBeenCalled()
            expect(mockTestService.saveTestResult).not.toHaveBeenCalled()
        })

        it('should return bad request when missing name', async () => {
            mockReq.body = {id: 'result-1', testId: 'test-1', runId: 'run-1'}

            await controller.createTestResult(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.badRequest).toHaveBeenCalled()
            expect(mockTestService.saveTestResult).not.toHaveBeenCalled()
        })

        it('should handle errors when saving test result', async () => {
            const testData = {
                id: 'result-1',
                testId: 'test-1',
                runId: 'run-1',
                name: 'Test',
            }
            mockReq.body = testData
            const error = new Error('Save error')
            mockTestService.saveTestResult.mockRejectedValue(error)

            await controller.createTestResult(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith('Error saving test result', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Save error',
                'Failed to save test result',
                500
            )
        })
    })

    describe('getTestById', () => {
        it('should get test by id with attachments', async () => {
            const test = {id: 'result-1', name: 'Test', attachments: []}
            mockReq.params = {id: 'result-1'}
            mockTestService.getTestById.mockResolvedValue(test)

            await controller.getTestById(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.getTestById).toHaveBeenCalledWith('result-1')
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, test)
        })

        it('should return 404 when test not found', async () => {
            mockReq.params = {id: 'nonexistent'}
            mockTestService.getTestById.mockResolvedValue(null)

            await controller.getTestById(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.notFound).toHaveBeenCalledWith(mockRes, 'Test')
        })

        it('should handle errors when fetching test', async () => {
            mockReq.params = {id: 'result-1'}
            const error = new Error('Database error')
            mockTestService.getTestById.mockRejectedValue(error)

            await controller.getTestById(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith('Error fetching test', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Database error',
                'Failed to fetch test',
                500
            )
        })
    })

    describe('rerunTest', () => {
        it('should rerun test successfully', async () => {
            const result = {runId: 'rerun-123', message: 'Test rerun started'}
            mockReq.params = {id: 'result-1'}
            mockReq.body = {maxWorkers: 2}
            mockTestService.rerunTest.mockResolvedValue(result)

            await controller.rerunTest(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.rerunTest).toHaveBeenCalledWith('result-1', 2)
            expect(ResponseHelper.success).toHaveBeenCalledWith(
                mockRes,
                result,
                'Test rerun started'
            )
        })

        it('should rerun test without maxWorkers', async () => {
            const result = {runId: 'rerun-123', message: 'Test rerun started'}
            mockReq.params = {id: 'result-1'}
            mockTestService.rerunTest.mockResolvedValue(result)

            await controller.rerunTest(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.rerunTest).toHaveBeenCalledWith('result-1', undefined)
        })

        it('should return 404 when test not found', async () => {
            mockReq.params = {id: 'nonexistent'}
            const error = new Error('Test not found')
            mockTestService.rerunTest.mockRejectedValue(error)

            await controller.rerunTest(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.notFound).toHaveBeenCalledWith(mockRes, 'Test')
        })

        it('should handle other errors', async () => {
            mockReq.params = {id: 'result-1'}
            const error = new Error('Rerun failed')
            mockTestService.rerunTest.mockRejectedValue(error)

            await controller.rerunTest(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith('Error starting test rerun', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Rerun failed',
                'Failed to start test rerun',
                500
            )
        })
    })

    describe('getTestHistory', () => {
        it('should get test history by result id', async () => {
            const test = {id: 'result-1', testId: 'test-1', name: 'Test'}
            const history = [{id: 'result-1'}, {id: 'result-2'}]
            mockReq.params = {id: 'result-1'}
            mockTestService.getTestById.mockResolvedValue(test)
            mockTestService.getTestHistory.mockResolvedValue(history)

            await controller.getTestHistory(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.getTestById).toHaveBeenCalledWith('result-1')
            expect(mockTestService.getTestHistory).toHaveBeenCalledWith('test-1', 50)
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, history, undefined, 2)
        })

        it('should get test history by testId directly', async () => {
            const history = [{id: 'result-1'}, {id: 'result-2'}]
            mockReq.params = {id: 'test-1'}
            mockTestService.getTestById.mockResolvedValue(null)
            mockTestService.getTestHistory.mockResolvedValue(history)

            await controller.getTestHistory(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.getTestHistory).toHaveBeenCalledWith('test-1', 50)
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, history, undefined, 2)
        })

        it('should get test history with custom limit', async () => {
            const history = [{id: 'result-1'}]
            mockReq.params = {id: 'test-1'}
            mockReq.query = {limit: '10'}
            mockTestService.getTestById.mockResolvedValue(null)
            mockTestService.getTestHistory.mockResolvedValue(history)

            await controller.getTestHistory(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.getTestHistory).toHaveBeenCalledWith('test-1', 10)
        })

        it('should handle errors when fetching history', async () => {
            mockReq.params = {id: 'test-1'}
            const error = new Error('History error')
            mockTestService.getTestById.mockRejectedValue(error)

            await controller.getTestHistory(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith('Error fetching test history', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'History error',
                'Failed to fetch test history',
                500
            )
        })
    })

    describe('getTestAttachments', () => {
        it('should get test attachments', async () => {
            const test = {id: 'result-1', attachments: [{id: 1, name: 'screenshot.png'}]}
            mockReq.params = {id: 'result-1'}
            mockTestService.getTestById.mockResolvedValue(test)

            await controller.getTestAttachments(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.getTestById).toHaveBeenCalledWith('result-1')
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, test.attachments)
        })

        it('should return empty array for test without attachments', async () => {
            const test = {id: 'result-1', attachments: undefined}
            mockReq.params = {id: 'result-1'}
            mockTestService.getTestById.mockResolvedValue(test)

            await controller.getTestAttachments(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, [])
        })

        it('should return 404 when test not found', async () => {
            mockReq.params = {id: 'nonexistent'}
            mockTestService.getTestById.mockResolvedValue(null)

            await controller.getTestAttachments(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.notFound).toHaveBeenCalledWith(mockRes, 'Test result')
        })

        it('should handle errors when fetching attachments', async () => {
            mockReq.params = {id: 'result-1'}
            const error = new Error('Attachment error')
            mockTestService.getTestById.mockRejectedValue(error)

            await controller.getTestAttachments(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith('Error fetching test attachments', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Attachment error',
                'Failed to fetch test attachments',
                500
            )
        })
    })

    describe('getDiagnostics', () => {
        it('should get diagnostics successfully', async () => {
            const diagnostics = {
                playwrightConfigFound: true,
                reporterConfigured: true,
                version: '1.0.0',
            }
            mockTestService.getDiagnostics.mockResolvedValue(diagnostics)

            await controller.getDiagnostics(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.getDiagnostics).toHaveBeenCalledTimes(1)
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, diagnostics)
        })

        it('should handle errors when fetching diagnostics', async () => {
            const error = new Error('Diagnostics error')
            mockTestService.getDiagnostics.mockRejectedValue(error)

            await controller.getDiagnostics(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith('Error fetching diagnostics', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Diagnostics error',
                'Failed to fetch diagnostics',
                500
            )
        })
    })

    describe('processStart', () => {
        it('should handle process start notification', async () => {
            const processData = {runId: 'run-123', type: 'run-all' as const}
            mockReq.body = processData

            const mockWsManager = {
                broadcastProcessStart: vi.fn(),
                broadcastConnectionStatus: vi.fn(),
            }
            vi.mocked(getWebSocketManager).mockReturnValue(mockWsManager as any)

            await controller.processStart(mockReq as ServiceRequest, mockRes as Response)

            expect(activeProcessesTracker.addProcess).toHaveBeenCalledWith(processData)
            expect(mockWsManager.broadcastProcessStart).toHaveBeenCalledWith(processData)
            expect(mockWsManager.broadcastConnectionStatus).toHaveBeenCalled()
            expect(ResponseHelper.success).toHaveBeenCalledWith(
                mockRes,
                {processId: 'run-123'},
                'Process start notification received'
            )
        })

        it('should return bad request when missing runId', async () => {
            mockReq.body = {type: 'run-all'}

            await controller.processStart(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                mockRes,
                'Missing required fields: runId, type'
            )
            expect(activeProcessesTracker.addProcess).not.toHaveBeenCalled()
        })

        it('should return bad request when missing type', async () => {
            mockReq.body = {runId: 'run-123'}

            await controller.processStart(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.badRequest).toHaveBeenCalled()
            expect(activeProcessesTracker.addProcess).not.toHaveBeenCalled()
        })

        it('should handle process start without WebSocket manager', async () => {
            const processData = {runId: 'run-123', type: 'run-all' as const}
            mockReq.body = processData
            vi.mocked(getWebSocketManager).mockReturnValue(null)

            await controller.processStart(mockReq as ServiceRequest, mockRes as Response)

            expect(activeProcessesTracker.addProcess).toHaveBeenCalledWith(processData)
            expect(ResponseHelper.success).toHaveBeenCalled()
        })

        it('should handle errors during process start', async () => {
            mockReq.body = {runId: 'run-123', type: 'run-all'}
            vi.mocked(activeProcessesTracker.addProcess).mockImplementation(() => {
                throw new Error('Tracker error')
            })

            await controller.processStart(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith(
                'Error handling process start notification',
                expect.any(Error)
            )
            expect(ResponseHelper.error).toHaveBeenCalled()
        })
    })

    describe('testStart', () => {
        it('should handle test start notification', async () => {
            const testData = {
                runId: 'run-123',
                testId: 'test-1',
                name: 'Test 1',
                filePath: 'test.spec.ts',
            }
            mockReq.body = testData

            const mockProgress = {
                processId: 'run-123',
                type: 'run-all' as const,
                totalTests: 10,
                completedTests: 0,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                runningTests: [{...testData, startedAt: new Date().toISOString()}],
                startTime: Date.now(),
            }
            vi.mocked(activeProcessesTracker.startTest).mockReturnValue(mockProgress)

            const mockWsManager = {
                broadcastTestProgress: vi.fn(),
            }
            vi.mocked(getWebSocketManager).mockReturnValue(mockWsManager as any)

            await controller.testStart(mockReq as ServiceRequest, mockRes as Response)

            expect(activeProcessesTracker.startTest).toHaveBeenCalledWith('run-123', {
                testId: 'test-1',
                name: 'Test 1',
                filePath: 'test.spec.ts',
            })
            expect(mockWsManager.broadcastTestProgress).toHaveBeenCalledWith(mockProgress)
            expect(ResponseHelper.success).toHaveBeenCalledWith(
                mockRes,
                {testId: 'test-1'},
                'Test start notification received'
            )
        })

        it('should return bad request when missing required fields', async () => {
            mockReq.body = {runId: 'run-123', testId: 'test-1'}

            await controller.testStart(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                mockRes,
                'Missing required fields: runId, testId, name, filePath'
            )
            expect(activeProcessesTracker.startTest).not.toHaveBeenCalled()
        })

        it('should handle test start without WebSocket manager', async () => {
            const testData = {
                runId: 'run-123',
                testId: 'test-1',
                name: 'Test 1',
                filePath: 'test.spec.ts',
            }
            mockReq.body = testData

            vi.mocked(activeProcessesTracker.startTest).mockReturnValue(null)
            vi.mocked(getWebSocketManager).mockReturnValue(null)

            await controller.testStart(mockReq as ServiceRequest, mockRes as Response)

            expect(activeProcessesTracker.startTest).toHaveBeenCalled()
            expect(ResponseHelper.success).toHaveBeenCalled()
        })

        it('should handle errors during test start', async () => {
            mockReq.body = {
                runId: 'run-123',
                testId: 'test-1',
                name: 'Test 1',
                filePath: 'test.spec.ts',
            }
            vi.mocked(activeProcessesTracker.startTest).mockImplementation(() => {
                throw new Error('Tracker error')
            })

            await controller.testStart(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith(
                'Error handling test start notification',
                expect.any(Error)
            )
            expect(ResponseHelper.error).toHaveBeenCalled()
        })
    })

    describe('processEnd', () => {
        it('should handle process end notification', async () => {
            const processData = {runId: 'run-123', status: 'completed' as const}
            mockReq.body = processData

            vi.mocked(activeProcessesTracker.isProcessRunning).mockReturnValue(true)
            vi.mocked(activeProcessesTracker.getConnectionStatus).mockReturnValue({
                activeRuns: [],
                activeGroups: [],
                isAnyProcessRunning: false,
            })

            const mockWsManager = {
                broadcastProcessEnd: vi.fn(),
                broadcastConnectionStatus: vi.fn(),
            }
            vi.mocked(getWebSocketManager).mockReturnValue(mockWsManager as any)

            await controller.processEnd(mockReq as ServiceRequest, mockRes as Response)

            expect(activeProcessesTracker.isProcessRunning).toHaveBeenCalledWith('run-123')
            expect(activeProcessesTracker.removeProcess).toHaveBeenCalledWith('run-123')
            expect(mockWsManager.broadcastProcessEnd).toHaveBeenCalledWith(processData)
            expect(mockWsManager.broadcastConnectionStatus).toHaveBeenCalled()
            expect(ResponseHelper.success).toHaveBeenCalledWith(
                mockRes,
                {processId: 'run-123', wasRunning: true},
                'Process end notification received'
            )
        })

        it('should return bad request when missing runId', async () => {
            mockReq.body = {status: 'completed'}

            await controller.processEnd(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                mockRes,
                'Missing required fields: runId, status'
            )
            expect(activeProcessesTracker.removeProcess).not.toHaveBeenCalled()
        })

        it('should return bad request when missing status', async () => {
            mockReq.body = {runId: 'run-123'}

            await controller.processEnd(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.badRequest).toHaveBeenCalled()
            expect(activeProcessesTracker.removeProcess).not.toHaveBeenCalled()
        })

        it('should handle process end without WebSocket manager', async () => {
            const processData = {runId: 'run-123', status: 'completed' as const}
            mockReq.body = processData
            vi.mocked(activeProcessesTracker.isProcessRunning).mockReturnValue(false)
            vi.mocked(getWebSocketManager).mockReturnValue(null)

            await controller.processEnd(mockReq as ServiceRequest, mockRes as Response)

            expect(activeProcessesTracker.removeProcess).toHaveBeenCalledWith('run-123')
            expect(ResponseHelper.success).toHaveBeenCalled()
        })

        it('should handle errors during process end', async () => {
            mockReq.body = {runId: 'run-123', status: 'completed'}
            vi.mocked(activeProcessesTracker.isProcessRunning).mockImplementation(() => {
                throw new Error('Tracker error')
            })

            await controller.processEnd(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith(
                '❌ Error handling process end notification',
                expect.any(Error)
            )
            expect(ResponseHelper.error).toHaveBeenCalled()
        })
    })

    describe('forceReset', () => {
        it('should force reset all processes', async () => {
            const stateBefore = {
                activeRuns: [
                    {
                        id: 'run-1',
                        type: 'run-all' as const,
                        startedAt: new Date().toISOString(),
                        details: {runId: 'run-1'},
                    },
                    {
                        id: 'run-2',
                        type: 'run-group' as const,
                        startedAt: new Date().toISOString(),
                        details: {runId: 'run-2', filePath: 'test.spec.ts'},
                    },
                ],
                activeGroups: ['group-1', 'group-2'],
                isAnyProcessRunning: true,
            }
            const stateAfter = {
                activeRuns: [],
                activeGroups: [],
                isAnyProcessRunning: false,
            }

            vi.mocked(activeProcessesTracker.getConnectionStatus)
                .mockReturnValueOnce(stateBefore)
                .mockReturnValueOnce(stateAfter)

            const mockWsManager = {
                broadcastConnectionStatus: vi.fn(),
            }
            vi.mocked(getWebSocketManager).mockReturnValue(mockWsManager as any)

            await controller.forceReset(mockReq as ServiceRequest, mockRes as Response)

            expect(activeProcessesTracker.forceReset).toHaveBeenCalled()
            expect(mockWsManager.broadcastConnectionStatus).toHaveBeenCalled()
            expect(ResponseHelper.success).toHaveBeenCalledWith(
                mockRes,
                {before: stateBefore, after: stateAfter},
                'Force reset completed successfully'
            )
        })

        it('should handle force reset without WebSocket manager', async () => {
            const state = {activeRuns: [], activeGroups: [], isAnyProcessRunning: false}
            vi.mocked(activeProcessesTracker.getConnectionStatus).mockReturnValue(state)
            vi.mocked(getWebSocketManager).mockReturnValue(null)

            await controller.forceReset(mockReq as ServiceRequest, mockRes as Response)

            expect(activeProcessesTracker.forceReset).toHaveBeenCalled()
            expect(ResponseHelper.success).toHaveBeenCalled()
        })

        it('should handle errors during force reset', async () => {
            vi.mocked(activeProcessesTracker.forceReset).mockImplementation(() => {
                throw new Error('Reset error')
            })

            await controller.forceReset(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith(
                '❌ Error during force reset',
                expect.any(Error)
            )
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Reset error',
                'Failed to perform force reset',
                500
            )
        })
    })

    describe('getTraceFile', () => {
        it('should serve trace file with valid token', async () => {
            const traceFile = {
                fileName: 'trace.zip',
                filePath: '/path/to/trace.zip',
            }
            mockReq.params = {attachmentId: 'attachment-1'}
            mockReq.query = {token: 'valid-token'}

            mockAuthService.verifyJWT.mockResolvedValue({valid: true})
            mockTestService.getTraceFileById.mockResolvedValue(traceFile)

            mockRes.sendFile = vi.fn((path: string, cb: any) => {
                cb(null)
            })

            await controller.getTraceFile(mockReq as ServiceRequest, mockRes as Response)

            expect(mockAuthService.verifyJWT).toHaveBeenCalledWith('Bearer valid-token')
            expect(mockTestService.getTraceFileById).toHaveBeenCalledWith('attachment-1')
            expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip')
            expect(mockRes.setHeader).toHaveBeenCalledWith(
                'Content-Disposition',
                'attachment; filename="trace.zip"'
            )
            expect(mockRes.sendFile).toHaveBeenCalled()
        })

        it('should sanitize filename for security', async () => {
            const traceFile = {
                fileName: '../../../etc/passwd.zip',
                filePath: '/safe/path/trace.zip',
            }
            mockReq.params = {attachmentId: 'attachment-1'}
            mockReq.query = {token: 'valid-token'}

            mockAuthService.verifyJWT.mockResolvedValue({valid: true})
            mockTestService.getTraceFileById.mockResolvedValue(traceFile)

            mockRes.sendFile = vi.fn((path: string, cb: any) => cb(null))

            await controller.getTraceFile(mockReq as ServiceRequest, mockRes as Response)

            // The sanitizer uses path.basename which extracts only the filename
            // and then replaces non-alphanumeric/dot/dash with underscores
            expect(mockRes.setHeader).toHaveBeenCalledWith(
                'Content-Disposition',
                'attachment; filename="passwd.zip"'
            )
        })

        it('should return 401 when token is missing', async () => {
            mockReq.params = {attachmentId: 'attachment-1'}
            mockReq.query = {}

            await controller.getTraceFile(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.unauthorized).toHaveBeenCalledWith(
                mockRes,
                'Token required in query parameter'
            )
            expect(mockTestService.getTraceFileById).not.toHaveBeenCalled()
        })

        it('should return 401 when token is invalid', async () => {
            mockReq.params = {attachmentId: 'attachment-1'}
            mockReq.query = {token: 'invalid-token'}

            mockAuthService.verifyJWT.mockResolvedValue({valid: false, message: 'Invalid token'})

            await controller.getTraceFile(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.unauthorized).toHaveBeenCalledWith(mockRes, 'Invalid token')
            expect(mockTestService.getTraceFileById).not.toHaveBeenCalled()
        })

        it('should return 404 when trace file not found', async () => {
            mockReq.params = {attachmentId: 'nonexistent'}
            mockReq.query = {token: 'valid-token'}

            mockAuthService.verifyJWT.mockResolvedValue({valid: true})
            mockTestService.getTraceFileById.mockResolvedValue(null)

            await controller.getTraceFile(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.notFound).toHaveBeenCalledWith(mockRes, 'Trace file not found')
        })

        it('should handle file send errors', async () => {
            const traceFile = {
                fileName: 'trace.zip',
                filePath: '/path/to/trace.zip',
            }
            mockReq.params = {attachmentId: 'attachment-1'}
            mockReq.query = {token: 'valid-token'}

            mockAuthService.verifyJWT.mockResolvedValue({valid: true})
            mockTestService.getTraceFileById.mockResolvedValue(traceFile)

            const fileError = new Error('File not found')
            mockRes.sendFile = vi.fn((path: string, cb: any) => cb(fileError))

            await controller.getTraceFile(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith('Error sending trace file:', fileError)
            expect(ResponseHelper.serverError).toHaveBeenCalledWith(
                mockRes,
                'Failed to send trace file'
            )
        })

        it('should not send error response if headers already sent', async () => {
            const traceFile = {
                fileName: 'trace.zip',
                filePath: '/path/to/trace.zip',
            }
            mockReq.params = {attachmentId: 'attachment-1'}
            mockReq.query = {token: 'valid-token'}

            mockAuthService.verifyJWT.mockResolvedValue({valid: true})
            mockTestService.getTraceFileById.mockResolvedValue(traceFile)

            const fileError = new Error('Stream error')
            mockRes.headersSent = true
            mockRes.sendFile = vi.fn((path: string, cb: any) => cb(fileError))

            await controller.getTraceFile(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalled()
            expect(ResponseHelper.serverError).not.toHaveBeenCalled()
        })

        it('should handle errors during trace file retrieval', async () => {
            mockReq.params = {attachmentId: 'attachment-1'}
            mockReq.query = {token: 'valid-token'}

            mockAuthService.verifyJWT.mockResolvedValue({valid: true})
            const error = new Error('Database error')
            mockTestService.getTraceFileById.mockRejectedValue(error)

            await controller.getTraceFile(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith('Error serving trace file', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Database error',
                'Failed to serve trace file',
                500
            )
        })
    })

    describe('deleteTest', () => {
        it('should successfully delete a test', async () => {
            mockReq.params = {testId: 'test-123'}
            mockTestService.deleteTest.mockResolvedValue({deletedExecutions: 5})

            await controller.deleteTest(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.deleteTest).toHaveBeenCalledWith('test-123')
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, {
                message: 'Test deleted successfully',
                deletedExecutions: 5,
            })
        })

        it('should return bad request if testId is missing', async () => {
            mockReq.params = {}

            await controller.deleteTest(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.deleteTest).not.toHaveBeenCalled()
            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                mockRes,
                'Missing testId parameter'
            )
        })

        it('should return bad request if testId is empty string', async () => {
            mockReq.params = {testId: ''}

            await controller.deleteTest(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.deleteTest).not.toHaveBeenCalled()
            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                mockRes,
                'Missing testId parameter'
            )
        })

        it('should handle service errors', async () => {
            mockReq.params = {testId: 'test-123'}
            const error = new Error('Database constraint violation')
            mockTestService.deleteTest.mockRejectedValue(error)

            await controller.deleteTest(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith('Error deleting test', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Database constraint violation',
                'Failed to delete test',
                500
            )
        })

        it('should handle unknown errors', async () => {
            mockReq.params = {testId: 'test-123'}
            mockTestService.deleteTest.mockRejectedValue('Unknown error')

            await controller.deleteTest(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith('Error deleting test', 'Unknown error')
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Unknown error',
                'Failed to delete test',
                500
            )
        })

        it('should handle deletion when no executions found', async () => {
            mockReq.params = {testId: 'non-existent-test'}
            mockTestService.deleteTest.mockResolvedValue({deletedExecutions: 0})

            await controller.deleteTest(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.deleteTest).toHaveBeenCalledWith('non-existent-test')
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, {
                message: 'Test deleted successfully',
                deletedExecutions: 0,
            })
        })

        it('should handle testId with special characters', async () => {
            mockReq.params = {testId: 'test-with-special-chars-!@#$%'}
            mockTestService.deleteTest.mockResolvedValue({deletedExecutions: 2})

            await controller.deleteTest(mockReq as ServiceRequest, mockRes as Response)

            expect(mockTestService.deleteTest).toHaveBeenCalledWith('test-with-special-chars-!@#$%')
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, {
                message: 'Test deleted successfully',
                deletedExecutions: 2,
            })
        })
    })
})

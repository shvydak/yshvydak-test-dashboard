import { Request, Response } from 'express'
import { TestService } from '../services/test.service'
import { ResponseHelper } from '../utils/response.helper'
import { Logger } from '../utils/logger.util'
import { ServiceRequest } from '../types/api.types'

export class TestController {
    constructor(private testService: TestService) {}

    // POST /api/tests/discovery - Discover all available tests
    discoverTests = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const result = await this.testService.discoverTests()
            return res.json(ResponseHelper.success(result))
        } catch (error) {
            Logger.error('Error during test discovery', error)
            return res.status(500).json(ResponseHelper.error(
                'Test discovery failed',
                error instanceof Error ? error.message : 'Unknown error'
            ))
        }
    }

    // POST /api/tests/test-save - Test saving single test (for debugging)
    testSave = async (req: ServiceRequest, res: Response): Promise<void> => {
        try {
            const testData = {
                id: 'debug-test-' + Date.now(),
                testId: 'test-debug-123',
                runId: '',
                name: 'Debug Test',
                filePath: 'debug/test.test.ts',
                status: 'pending' as any,
                duration: 0,
                errorMessage: undefined,
                errorStack: undefined,
                retryCount: 0,
                metadata: { debug: true },
                timestamp: new Date().toISOString()
            }

            const resultId = await this.testService.saveTestResult(testData)
            Logger.success('Test saved with ID:', resultId)

            res.json(ResponseHelper.success({
                resultId,
                testData
            }))
        } catch (error) {
            Logger.error('Error saving test', error)
            res.status(500).json(ResponseHelper.error(
                'Failed to save test',
                error instanceof Error ? error.message : 'Unknown error'
            ))
        }
    }

    // POST /api/tests/run-all - Run all tests
    runAllTests = async (req: ServiceRequest, res: Response): Promise<void> => {
        try {
            const result = await this.testService.runAllTests()
            res.json(ResponseHelper.success(result))
        } catch (error) {
            Logger.error('Error running all tests', error)
            res.status(500).json(ResponseHelper.error(
                'Failed to run all tests',
                error instanceof Error ? error.message : 'Unknown error'
            ))
        }
    }

    // POST /api/tests/run-group - Run tests from a specific file/group
    runTestGroup = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const { filePath } = req.body
            if (!filePath) {
                return res.status(400).json(ResponseHelper.badRequest('Missing filePath parameter'))
            }

            const result = await this.testService.runTestGroup(filePath)
            return res.json(ResponseHelper.success(result))
        } catch (error) {
            Logger.error('Error running group tests', error)
            return res.status(500).json(ResponseHelper.error(
                'Failed to run group tests',
                error instanceof Error ? error.message : 'Unknown error'
            ))
        }
    }

    // GET /api/tests - Get all test results
    getAllTests = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const { runId, status, limit = 100 } = req.query

            const filters = {
                runId: runId as string,
                status: status as string,
                limit: parseInt(limit as string)
            }

            const tests = await this.testService.getAllTests(filters)
            return res.json(ResponseHelper.success(tests, undefined, tests.length))
        } catch (error) {
            Logger.error('Error fetching tests', error)
            return res.status(500).json(ResponseHelper.error(
                'Failed to fetch tests',
                error instanceof Error ? error.message : 'Unknown error'
            ))
        }
    }

    // GET /api/tests/stats - Get database statistics
    getTestStats = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const stats = await this.testService.getTestStats()
            return res.json(ResponseHelper.success(stats))
        } catch (error) {
            Logger.error('Error fetching stats', error)
            return res.status(500).json(ResponseHelper.error(
                'Failed to fetch stats',
                error instanceof Error ? error.message : 'Unknown error'
            ))
        }
    }

    // DELETE /api/tests/all - Clear all test data
    clearAllTests = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const statsBefore = await this.testService.getTestStats()
            await this.testService.clearAllTests()

            return res.json(ResponseHelper.success({
                message: 'All test data cleared successfully',
                statsBefore
            }))
        } catch (error) {
            Logger.error('Error clearing test data', error)
            return res.status(500).json(ResponseHelper.error(
                'Failed to clear test data',
                error instanceof Error ? error.message : 'Unknown error'
            ))
        }
    }

    // POST /api/tests - Create a new test result (compatible with yshvydakReporter.ts)
    createTestResult = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const testData = req.body

            // Validate required fields
            if (!testData.id || !testData.testId || !testData.runId || !testData.name) {
                return res.status(400).json(ResponseHelper.badRequest(
                    'Missing required fields: id, testId, runId, name'
                ))
            }

            const testResultData = {
                id: testData.id,
                runId: testData.runId,
                testId: testData.testId,
                name: testData.name,
                filePath: testData.filePath || '',
                status: testData.status || 'unknown',
                duration: testData.duration || 0,
                errorMessage: testData.errorMessage || null,
                errorStack: testData.errorStack || null,
                retryCount: 0,
                metadata: testData.metadata || {},
                timestamp: new Date().toISOString(),
                attachments: testData.attachments
            }

            await this.testService.saveTestResult(testResultData as any)

            return res.json(ResponseHelper.success(
                { id: testData.id },
                'Test result saved successfully'
            ))
        } catch (error) {
            Logger.error('Error saving test result', error)
            return res.status(500).json(ResponseHelper.error(
                'Failed to save test result',
                error instanceof Error ? error.message : 'Unknown error'
            ))
        }
    }

    // GET /api/tests/:id - Get specific test result with attachments
    getTestById = async (req: ServiceRequest, res: Response): Promise<void> => {
        try {
            const { id } = req.params
            const test = await this.testService.getTestById(id)

            if (!test) {
                return res.status(404).json(ResponseHelper.notFound('Test'))
            }

            res.json(ResponseHelper.success(test))
        } catch (error) {
            Logger.error('Error fetching test', error)
            res.status(500).json(ResponseHelper.error(
                'Failed to fetch test',
                error instanceof Error ? error.message : 'Unknown error'
            ))
        }
    }

    // POST /api/tests/:id/rerun - Rerun a specific test
    rerunTest = async (req: ServiceRequest, res: Response): Promise<void> => {
        try {
            const { id } = req.params
            const result = await this.testService.rerunTest(id)

            res.json(ResponseHelper.success(result, 'Test rerun started'))
        } catch (error) {
            if (error instanceof Error && error.message === 'Test not found') {
                return res.status(404).json(ResponseHelper.notFound('Test'))
            }

            Logger.error('Error starting test rerun', error)
            res.status(500).json(ResponseHelper.error(
                'Failed to start test rerun',
                error instanceof Error ? error.message : 'Unknown error'
            ))
        }
    }

    // GET /api/tests/:id/history - Get test history (all runs of this test)
    getTestHistory = async (req: ServiceRequest, res: Response): Promise<void> => {
        try {
            const { id } = req.params
            const { limit = 10 } = req.query

            const test = await this.testService.getTestById(id)
            if (!test) {
                return res.status(404).json(ResponseHelper.notFound('Test'))
            }

            const history = await this.testService.getTestHistory(
                test.testId,
                parseInt(limit as string)
            )

            res.json(ResponseHelper.success(history, undefined, history.length))
        } catch (error) {
            Logger.error('Error fetching test history', error)
            res.status(500).json(ResponseHelper.error(
                'Failed to fetch test history',
                error instanceof Error ? error.message : 'Unknown error'
            ))
        }
    }

    // GET /api/tests/:id/attachments - Get attachments for a specific test result
    getTestAttachments = async (req: ServiceRequest, res: Response): Promise<void> => {
        try {
            const { id } = req.params

            // Check if test result exists
            const test = await this.testService.getTestById(id)
            if (!test) {
                return res.status(404).json(ResponseHelper.notFound('Test result'))
            }

            res.json(ResponseHelper.success(test.attachments || []))
        } catch (error) {
            Logger.error('Error fetching test attachments', error)
            res.status(500).json(ResponseHelper.error(
                'Failed to fetch test attachments',
                error instanceof Error ? error.message : 'Unknown error'
            ))
        }
    }

    // GET /api/tests/diagnostics - Get integration diagnostics
    getDiagnostics = async (_req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const diagnostics = await this.testService.getDiagnostics()
            return res.json(ResponseHelper.success(diagnostics))
        } catch (error) {
            Logger.error('Error fetching diagnostics', error)
            return res.status(500).json(ResponseHelper.error(
                'Failed to fetch diagnostics',
                error instanceof Error ? error.message : 'Unknown error'
            ))
        }
    }
}
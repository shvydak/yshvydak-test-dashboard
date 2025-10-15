import {Response} from 'express'
import {TestService} from '../services/test.service'
import {AuthService} from '../services/auth.service'
import {ResponseHelper} from '../utils/response.helper'
import {Logger} from '../utils/logger.util'
import {ServiceRequest} from '../types/api.types'
import {ProcessStartData, ProcessEndData} from '@yshvydak/core'
import {activeProcessesTracker} from '../services/activeProcesses.service'
import {getWebSocketManager} from '../websocket/server'
import path from 'path'

export class TestController {
    constructor(
        private testService: TestService,
        private authService: AuthService
    ) {}

    // POST /api/tests/discovery - Discover all available tests
    discoverTests = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const result = await this.testService.discoverTests()
            return ResponseHelper.success(res, result)
        } catch (error) {
            Logger.error('Error during test discovery', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Test discovery failed',
                500
            )
        }
    }

    // POST /api/tests/run-all - Run all tests
    runAllTests = async (req: ServiceRequest, res: Response): Promise<void> => {
        try {
            const {maxWorkers} = req.body
            const result = await this.testService.runAllTests(maxWorkers)
            ResponseHelper.success(res, result)
        } catch (error) {
            Logger.error('Error running all tests', error)
            ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to run all tests',
                500
            )
        }
    }

    // POST /api/tests/run-group - Run tests from a specific file/group
    runTestGroup = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const {filePath, maxWorkers} = req.body
            if (!filePath) {
                return ResponseHelper.badRequest(res, 'Missing filePath parameter')
            }

            const result = await this.testService.runTestGroup(filePath, maxWorkers)
            return ResponseHelper.success(res, result)
        } catch (error) {
            Logger.error('Error running group tests', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to run group tests',
                500
            )
        }
    }

    // GET /api/tests - Get all test results
    getAllTests = async (req: ServiceRequest, res: Response): Promise<void> => {
        try {
            const {runId, status, limit = 100} = req.query

            const filters = {
                runId: runId as string,
                status: status as string,
                limit: parseInt(limit as string),
            }

            const tests = await this.testService.getAllTests(filters)
            ResponseHelper.success(res, tests, undefined, tests.length)
        } catch (error) {
            Logger.error('Error fetching tests', error)
            ResponseHelper.error(
                res,
                'Failed to fetch tests',
                error instanceof Error ? error.message : 'Unknown error',
                500
            )
        }
    }

    // GET /api/tests/stats - Get database statistics
    getTestStats = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const stats = await this.testService.getTestStats()
            return ResponseHelper.success(res, stats)
        } catch (error) {
            Logger.error('Error fetching stats', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to fetch stats',
                500
            )
        }
    }

    // GET /api/tests/flaky - Get flaky tests
    getFlakyTests = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const {days = 30, threshold = 10} = req.query
            const flakyTests = await this.testService.getFlakyTests(
                parseInt(days as string) || 30,
                parseInt(threshold as string) || 10
            )
            return ResponseHelper.success(res, flakyTests, undefined, flakyTests.length)
        } catch (error) {
            Logger.error('Error fetching flaky tests', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to fetch flaky tests',
                500
            )
        }
    }

    // GET /api/tests/timeline - Get test execution timeline
    getTestTimeline = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const {days = 30} = req.query
            const timeline = await this.testService.getTestTimeline(parseInt(days as string) || 30)
            return ResponseHelper.success(res, timeline, undefined, timeline.length)
        } catch (error) {
            Logger.error('Error fetching test timeline', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to fetch test timeline',
                500
            )
        }
    }

    // DELETE /api/tests/all - Clear all test data
    clearAllTests = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const statsBefore = await this.testService.getTestStats()
            await this.testService.clearAllTests()

            return ResponseHelper.success(res, {
                message: 'All test data cleared successfully',
                statsBefore,
            })
        } catch (error) {
            Logger.error('Error clearing test data', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to clear test data',
                500
            )
        }
    }

    // POST /api/tests - Create a new test result (compatible with yshvydakReporter.ts)
    createTestResult = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const testData = req.body

            // Validate required fields
            if (!testData.id || !testData.testId || !testData.runId || !testData.name) {
                return ResponseHelper.badRequest(
                    res,
                    'Missing required fields: id, testId, runId, name'
                )
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
                attachments: testData.attachments,
            }

            await this.testService.saveTestResult(testResultData as any)

            return ResponseHelper.success(res, {id: testData.id}, 'Test result saved successfully')
        } catch (error) {
            Logger.error('Error saving test result', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to save test result',
                500
            )
        }
    }

    // GET /api/tests/:id - Get specific test result with attachments
    getTestById = async (req: ServiceRequest, res: Response): Promise<void> => {
        try {
            const {id} = req.params
            const test = await this.testService.getTestById(id)

            if (!test) {
                ResponseHelper.notFound(res, 'Test')
                return
            }

            ResponseHelper.success(res, test)
        } catch (error) {
            Logger.error('Error fetching test', error)
            ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to fetch test',
                500
            )
        }
    }

    // POST /api/tests/:id/rerun - Rerun a specific test
    rerunTest = async (req: ServiceRequest, res: Response): Promise<void> => {
        try {
            const {id} = req.params
            const {maxWorkers} = req.body
            const result = await this.testService.rerunTest(id, maxWorkers)

            ResponseHelper.success(res, result, 'Test rerun started')
        } catch (error) {
            if (error instanceof Error && error.message === 'Test not found') {
                ResponseHelper.notFound(res, 'Test')
                return
            }

            Logger.error('Error starting test rerun', error)
            ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to start test rerun',
                500
            )
        }
    }

    // GET /api/tests/:id/history - Get test history (all runs of this test)
    getTestHistory = async (req: ServiceRequest, res: Response): Promise<void> => {
        try {
            const {id} = req.params
            const {limit = 50} = req.query

            // Try to find test by ID first (for backwards compatibility)
            const test = await this.testService.getTestById(id)

            // If found by ID, use its testId; otherwise treat parameter as testId directly
            const testId = test ? test.testId : id

            const history = await this.testService.getTestHistory(
                testId,
                parseInt(limit as string) || 50
            )

            ResponseHelper.success(res, history, undefined, history.length)
            return
        } catch (error) {
            Logger.error('Error fetching test history', error)
            ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to fetch test history',
                500
            )
        }
    }

    // GET /api/tests/:id/attachments - Get attachments for a specific test result
    getTestAttachments = async (req: ServiceRequest, res: Response): Promise<void> => {
        try {
            const {id} = req.params

            // Check if test result exists
            const test = await this.testService.getTestById(id)
            if (!test) {
                ResponseHelper.notFound(res, 'Test result')
                return
            }

            ResponseHelper.success(res, test.attachments || [])
            return
        } catch (error) {
            Logger.error('Error fetching test attachments', error)
            ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to fetch test attachments',
                500
            )
        }
    }

    // GET /api/tests/diagnostics - Get integration diagnostics
    getDiagnostics = async (_req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const diagnostics = await this.testService.getDiagnostics()
            return ResponseHelper.success(res, diagnostics)
        } catch (error) {
            Logger.error('Error fetching diagnostics', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to fetch diagnostics',
                500
            )
        }
    }

    // POST /api/tests/process-start - Notification that a process has started
    processStart = async (req: ServiceRequest, res: Response): Promise<void> => {
        try {
            const processData: ProcessStartData = req.body

            // Validate required fields
            if (!processData.runId || !processData.type) {
                ResponseHelper.badRequest(res, 'Missing required fields: runId, type')
                return
            }

            // Add process to tracker
            activeProcessesTracker.addProcess(processData)

            // Notify all WebSocket clients
            const wsManager = getWebSocketManager()
            if (wsManager) {
                wsManager.broadcastProcessStart(processData)
                wsManager.broadcastConnectionStatus()
            }

            Logger.info(`Process started: ${processData.runId} (${processData.type})`)

            ResponseHelper.success(
                res,
                {processId: processData.runId},
                'Process start notification received'
            )
            return
        } catch (error) {
            Logger.error('Error handling process start notification', error)
            ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to handle process start notification',
                500
            )
        }
    }

    // POST /api/tests/process-end - Notification that a process has ended
    processEnd = async (req: ServiceRequest, res: Response): Promise<void> => {
        try {
            const processData: ProcessEndData = req.body
            Logger.info(`📥 Received process end notification: ${JSON.stringify(processData)}`)

            // Validate required fields
            if (!processData.runId || !processData.status) {
                Logger.warn('❌ Process end notification missing required fields', {processData})
                ResponseHelper.badRequest(res, 'Missing required fields: runId, status')
                return
            }

            // Check if process exists before removal
            const wasProcessRunning = activeProcessesTracker.isProcessRunning(processData.runId)
            Logger.info(`🔍 Process ${processData.runId} was running: ${wasProcessRunning}`)

            // Remove process from tracker
            activeProcessesTracker.removeProcess(processData.runId)

            // Get current state after removal
            const currentState = activeProcessesTracker.getConnectionStatus()
            Logger.info(`📊 State after process removal:`, currentState)

            // Notify all WebSocket clients
            const wsManager = getWebSocketManager()
            if (wsManager) {
                wsManager.broadcastProcessEnd(processData)
                wsManager.broadcastConnectionStatus()
                Logger.info('📡 Broadcasted process end and connection status via WebSocket')
            } else {
                Logger.warn('⚠️ WebSocket manager not available for broadcasting')
            }

            Logger.info(
                `✅ Process ended successfully: ${processData.runId} (${processData.status})`
            )

            ResponseHelper.success(
                res,
                {processId: processData.runId, wasRunning: wasProcessRunning},
                'Process end notification received'
            )
            return
        } catch (error) {
            Logger.error('❌ Error handling process end notification', error)
            ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to handle process end notification',
                500
            )
        }
    }

    // POST /api/tests/force-reset - Emergency reset of all active processes
    forceReset = async (req: ServiceRequest, res: Response): Promise<void> => {
        try {
            Logger.warn('🚨 Force reset requested - clearing all active processes')

            // Get state before reset
            const stateBefore = activeProcessesTracker.getConnectionStatus()

            // Force reset
            activeProcessesTracker.forceReset()

            // Get state after reset
            const stateAfter = activeProcessesTracker.getConnectionStatus()

            // Notify all WebSocket clients
            const wsManager = getWebSocketManager()
            if (wsManager) {
                wsManager.broadcastConnectionStatus()
                Logger.info('📡 Broadcasted updated connection status after force reset')
            }

            Logger.warn('✅ Force reset completed')

            ResponseHelper.success(
                res,
                {
                    before: stateBefore,
                    after: stateAfter,
                },
                'Force reset completed successfully'
            )
            return
        } catch (error) {
            Logger.error('❌ Error during force reset', error)
            ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to perform force reset',
                500
            )
        }
    }

    // GET /api/tests/traces/:attachmentId - Get trace file with JWT query parameter
    getTraceFile = async (req: ServiceRequest, res: Response): Promise<void> => {
        try {
            const {attachmentId} = req.params
            const token = req.query.token as string

            // Validate JWT token from query parameter
            if (!token) {
                ResponseHelper.unauthorized(res, 'Token required in query parameter')
                return
            }

            // Verify JWT token using AuthService
            const tokenResult = await this.authService.verifyJWT(`Bearer ${token}`)

            if (!tokenResult.valid) {
                ResponseHelper.unauthorized(res, tokenResult.message || 'Invalid token')
                return
            }

            // Get trace file
            const traceFile = await this.testService.getTraceFileById(attachmentId)

            if (!traceFile) {
                ResponseHelper.notFound(res, 'Trace file not found')
                return
            }

            // Sanitize filename for security
            const sanitizedFileName = path
                .basename(traceFile.fileName)
                .replace(/[^a-zA-Z0-9.-]/g, '_')

            // Set appropriate headers for file download with security
            res.setHeader('Content-Type', 'application/zip')
            res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}"`)
            res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate')
            res.setHeader('Pragma', 'no-cache')
            res.setHeader('Expires', '0')
            res.setHeader('X-Content-Type-Options', 'nosniff')

            // Send file with absolute path
            res.sendFile(path.resolve(traceFile.filePath), (err) => {
                if (err) {
                    Logger.error('Error sending trace file:', err)
                    if (!res.headersSent) {
                        ResponseHelper.serverError(res, 'Failed to send trace file')
                    }
                }
            })
        } catch (error) {
            Logger.error('Error serving trace file', error)
            ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to serve trace file',
                500
            )
        }
    }
}

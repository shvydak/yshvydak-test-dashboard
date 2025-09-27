import { Request, Response } from 'express'
import { RunRepository } from '../repositories/run.repository'
import { ResponseHelper } from '../utils/response.helper'
import { Logger } from '../utils/logger.util'

export class RunController {
    constructor(private runRepository: RunRepository) {}

    // POST /api/runs - Create a new test run (compatible with yshvydakReporter.ts)
    createTestRun = async (req: Request, res: Response): Promise<Response> => {
        try {
            const runData = req.body

            // Validate required fields
            if (!runData.id || !runData.status || typeof runData.totalTests !== 'number') {
                return ResponseHelper.badRequest(res, 'Missing required fields: id, status, totalTests')
            }

            const runId = await this.runRepository.createTestRun({
                id: runData.id,
                status: runData.status,
                totalTests: runData.totalTests,
                passedTests: runData.passedTests || 0,
                failedTests: runData.failedTests || 0,
                skippedTests: runData.skippedTests || 0,
                duration: runData.duration || 0,
                metadata: runData.metadata
            })

            Logger.success(`Test run created with ID: ${runId}`)

            return ResponseHelper.success(res,
                { id: runId },
                'Test run created successfully'
            )
        } catch (error) {
            Logger.error('Error creating test run', error)
            return ResponseHelper.error(res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to create test run', 500
            )
        }
    }

    // PUT /api/runs/:id - Update test run (compatible with yshvydakReporter.ts)
    updateTestRun = async (req: Request, res: Response): Promise<Response> => {
        try {
            const { id } = req.params
            const updates = req.body

            await this.runRepository.updateTestRun(id, updates)

            Logger.success(`Test run updated: ${id}`)

            return ResponseHelper.success(res,
                { id },
                'Test run updated successfully'
            )
        } catch (error) {
            Logger.error('Error updating test run', error)
            return ResponseHelper.error(res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to update test run', 500
            )
        }
    }

    // GET /api/runs - Get all test runs
    getAllTestRuns = async (req: Request, res: Response): Promise<Response> => {
        try {
            const { limit = 50, status } = req.query
            const runs = await this.runRepository.getAllTestRuns(parseInt(limit as string))

            return res.json(ResponseHelper.successData(runs, `Found ${runs.length} runs`))
        } catch (error) {
            Logger.error('Error fetching runs', error)
            return res.status(500).json(ResponseHelper.errorData(
                'Failed to fetch runs',
                error instanceof Error ? error.message : 'Unknown error'
            ))
        }
    }

    // GET /api/runs/stats - Get dashboard statistics
    getStats = async (req: Request, res: Response): Promise<Response> => {
        try {
            const stats = await this.runRepository.getStats()

            // Get recent runs
            const recentRuns = await this.runRepository.getAllTestRuns(5)

            // Calculate success rate
            const successRate = stats.total_tests > 0
                ? ((stats.total_passed / stats.total_tests) * 100).toFixed(1)
                : '0'

            const responseData = {
                ...stats,
                success_rate: parseFloat(successRate),
                recent_runs: recentRuns,
            }

            return res.json(ResponseHelper.successData(responseData))
        } catch (error) {
            Logger.error('Error fetching stats', error)
            return res.status(500).json(ResponseHelper.errorData(
                'Failed to fetch stats',
                error instanceof Error ? error.message : 'Unknown error'
            ))
        }
    }

    // GET /api/runs/:id - Get specific test run
    getTestRun = async (req: Request, res: Response): Promise<Response> => {
        try {
            const { id } = req.params
            const run = await this.runRepository.getTestRun(id)

            if (!run) {
                return ResponseHelper.notFound(res, 'Test run')
            }

            return ResponseHelper.success(res, run)
        } catch (error) {
            Logger.error('Error fetching test run', error)
            return ResponseHelper.error(res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to fetch test run', 500
            )
        }
    }
}
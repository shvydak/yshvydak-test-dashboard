import {Response} from 'express'
import {PipelineExecutionService} from '../services/pipelineExecution.service'
import {ResponseHelper} from '../utils/response.helper'
import {Logger} from '../utils/logger.util'
import {ServiceRequest} from '../types/api.types'

export class PipelineController {
    constructor(private pipelineExecutionService: PipelineExecutionService) {}

    // POST /api/pipeline/run - Start the configured CI pipeline (ordered multi-project run)
    runPipeline = async (req: ServiceRequest, res: Response): Promise<void> => {
        try {
            const {maxWorkers, source} = req.body
            const pipeline = await this.pipelineExecutionService.startPipeline(maxWorkers, source)
            ResponseHelper.success(res, pipeline)
        } catch (error) {
            if (error instanceof Error && error.message.includes('TESTS_ALREADY_RUNNING')) {
                try {
                    const errorData = JSON.parse(error.message)
                    res.status(409).json({
                        success: false,
                        error: errorData.message,
                        message: errorData.message,
                        code: errorData.code,
                        currentRunId: errorData.currentRunId,
                        startedAt: errorData.startedAt,
                        timestamp: new Date().toISOString(),
                    })
                    return
                } catch {
                    ResponseHelper.error(
                        res,
                        'Tests are already running',
                        'Tests are already running',
                        409
                    )
                    return
                }
            }

            if (error instanceof Error && error.message.includes('CI_AUTORUN_PAUSED')) {
                try {
                    const errorData = JSON.parse(error.message)
                    res.status(423).json({
                        success: false,
                        code: errorData.code,
                        message: errorData.message,
                        resumeAt: errorData.resumeAt,
                        timestamp: new Date().toISOString(),
                    })
                    return
                } catch {
                    ResponseHelper.error(res, 'CI auto-run is paused', 'CI auto-run is paused', 423)
                    return
                }
            }

            if (error instanceof Error && error.message.includes('PIPELINE_EMPTY')) {
                try {
                    const errorData = JSON.parse(error.message)
                    ResponseHelper.badRequest(res, errorData.message)
                    return
                } catch {
                    ResponseHelper.badRequest(
                        res,
                        'No project tabs are configured to run in the CI pipeline'
                    )
                    return
                }
            }

            Logger.error('Error starting pipeline', error)
            ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to start pipeline',
                500
            )
        }
    }

    // GET /api/pipeline/status/:pipelineRunId - Poll pipeline run state
    getPipelineStatus = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const {pipelineRunId} = req.params
            const pipeline = this.pipelineExecutionService.getPipeline(pipelineRunId)

            if (!pipeline) {
                return ResponseHelper.notFound(res, 'Pipeline run')
            }

            return ResponseHelper.success(res, pipeline)
        } catch (error) {
            Logger.error('Error fetching pipeline status', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to fetch pipeline status',
                500
            )
        }
    }

    // GET /api/pipeline/status/current - Rehydrate the most recent pipeline run (if any)
    getCurrentPipelineStatus = async (_req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const pipeline = this.pipelineExecutionService.getCurrentPipeline()

            if (!pipeline) {
                return ResponseHelper.notFound(res, 'Pipeline run')
            }

            return ResponseHelper.success(res, pipeline)
        } catch (error) {
            Logger.error('Error fetching current pipeline status', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to fetch current pipeline status',
                500
            )
        }
    }
}

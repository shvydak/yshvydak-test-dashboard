import {Response} from 'express'
import {PipelineExecutionService} from '../services/pipelineExecution.service'
import {ResponseHelper} from '../utils/response.helper'
import {Logger} from '../utils/logger.util'
import {ServiceRequest} from '../types/api.types'
import {parseCIPipelineName} from '../utils/ciPipeline.util'
import {respondIfCIRunQueued} from '../utils/ciRunQueued.util'

export class PipelineController {
    constructor(private pipelineExecutionService: PipelineExecutionService) {}

    // POST /api/pipeline/run - Start the configured CI pipeline (ordered multi-project run)
    runPipeline = async (req: ServiceRequest, res: Response): Promise<void> => {
        try {
            const {maxWorkers, source, pipeline: pipelineName, notify} = req.body
            const parsedPipeline = parseCIPipelineName(pipelineName)
            if (!parsedPipeline) {
                ResponseHelper.badRequest(
                    res,
                    'Unknown pipeline name. Use "develop" or "production".'
                )
                return
            }
            const result = await this.pipelineExecutionService.requestPipelineRun({
                maxWorkers,
                source,
                pipeline: parsedPipeline,
                notify: notify === true,
            })

            if (result.status === 'queued') {
                // Accepted, not started: the dashboard runs it when the current run ends.
                res.status(202).json({
                    success: true,
                    data: {status: 'queued', pipeline: result.pipeline},
                    timestamp: new Date().toISOString(),
                })
                return
            }

            ResponseHelper.success(res, result.pipeline)
        } catch (error) {
            if (respondIfCIRunQueued(res, error)) return

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
                    res.status(400).json({
                        success: false,
                        error: 'Bad request',
                        message: errorData.message,
                        code: 'PIPELINE_EMPTY',
                        timestamp: new Date().toISOString(),
                    })
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

    // POST /api/pipeline/stop - Stop every active run and remove its results (JWT, see pipeline.routes)
    stopPipeline = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const reason = req.body?.reason ?? 'manual'
            // Only the Stop button comes in over HTTP; timeout/restart/replaced are internal callers.
            if (reason !== 'manual') {
                return ResponseHelper.badRequest(res, 'Only reason "manual" is accepted')
            }

            const outcome = await this.pipelineExecutionService.stop('manual')
            return ResponseHelper.success(res, outcome)
        } catch (error) {
            Logger.error('Error stopping the run', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to stop the run',
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
            const queue = this.pipelineExecutionService.getQueue()
            const stopping = this.pipelineExecutionService.isStopping()

            // Queue and stopping are siblings of `data` so the pipeline-state contract stays unchanged.
            if (!pipeline && queue.length === 0 && !stopping) {
                return ResponseHelper.notFound(res, 'Pipeline run')
            }

            return res.status(200).json({
                success: true,
                data: pipeline,
                queue,
                stopping,
                timestamp: new Date().toISOString(),
            })
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

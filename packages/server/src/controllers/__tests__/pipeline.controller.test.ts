import {describe, it, expect, vi, beforeEach} from 'vitest'
import {PipelineController} from '../pipeline.controller'
import type {ServiceRequest} from '../../types/api.types'
import type {Response} from 'express'
import {ResponseHelper} from '../../utils/response.helper'
import {Logger} from '../../utils/logger.util'

vi.mock('../../services/pipelineExecution.service')
vi.mock('../../utils/response.helper')
vi.mock('../../utils/logger.util', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
}))

describe('PipelineController', () => {
    let controller: PipelineController
    let mockPipelineExecutionService: any
    let mockReq: Partial<ServiceRequest>
    let mockRes: Partial<Response>

    const createMockRequest = (overrides: Partial<ServiceRequest> = {}): ServiceRequest => {
        return {
            body: {},
            params: {},
            query: {},
            ...overrides,
        } as ServiceRequest
    }

    const createMockResponse = (): Response => {
        const res: any = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        }
        return res
    }

    beforeEach(() => {
        vi.clearAllMocks()

        mockPipelineExecutionService = {
            requestPipelineRun: vi.fn(),
            getPipeline: vi.fn(),
            getCurrentPipeline: vi.fn(),
            getQueue: vi.fn().mockReturnValue([]),
        }

        controller = new PipelineController(mockPipelineExecutionService)
        mockReq = createMockRequest()
        mockRes = createMockResponse()
    })

    describe('runPipeline', () => {
        it('starts the pipeline and returns its initial state', async () => {
            const pipelineState = {pipelineRunId: 'p1', status: 'running', steps: []}
            mockReq.body = {maxWorkers: 2, source: 'script'}
            mockPipelineExecutionService.requestPipelineRun.mockResolvedValue({
                status: 'started',
                pipeline: pipelineState,
            })

            await controller.runPipeline(mockReq as ServiceRequest, mockRes as Response)

            expect(mockPipelineExecutionService.requestPipelineRun).toHaveBeenCalledWith({
                maxWorkers: 2,
                source: 'script',
                pipeline: 'develop',
                notify: false,
            })
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, pipelineState)
        })

        it('passes notify: true through to the execution service', async () => {
            mockReq.body = {source: 'script', notify: true}
            mockPipelineExecutionService.requestPipelineRun.mockResolvedValue({
                status: 'started',
                pipeline: {pipelineRunId: 'p1'},
            })

            await controller.runPipeline(mockReq as ServiceRequest, mockRes as Response)

            expect(mockPipelineExecutionService.requestPipelineRun).toHaveBeenCalledWith(
                expect.objectContaining({notify: true})
            )
        })

        it('treats a non-boolean notify as false', async () => {
            mockReq.body = {source: 'script', notify: 'yes'}
            mockPipelineExecutionService.requestPipelineRun.mockResolvedValue({
                status: 'started',
                pipeline: {pipelineRunId: 'p1'},
            })

            await controller.runPipeline(mockReq as ServiceRequest, mockRes as Response)

            expect(mockPipelineExecutionService.requestPipelineRun).toHaveBeenCalledWith(
                expect.objectContaining({notify: false})
            )
        })

        it('answers 202 with the queued marker when the request was queued', async () => {
            mockReq.body = {source: 'script', notify: true, pipeline: 'production'}
            mockPipelineExecutionService.requestPipelineRun.mockResolvedValue({
                status: 'queued',
                pipeline: 'production',
            })

            await controller.runPipeline(mockReq as ServiceRequest, mockRes as Response)

            expect(mockRes.status).toHaveBeenCalledWith(202)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: {status: 'queued', pipeline: 'production'},
                })
            )
            expect(ResponseHelper.success).not.toHaveBeenCalled()
        })

        it('returns 409 CI_RUN_QUEUED for a manual start while a CI run is queued', async () => {
            mockPipelineExecutionService.requestPipelineRun.mockRejectedValue(
                new Error(JSON.stringify({code: 'CI_RUN_QUEUED', message: 'A CI run is queued'}))
            )

            await controller.runPipeline(mockReq as ServiceRequest, mockRes as Response)

            expect(mockRes.status).toHaveBeenCalledWith(409)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({success: false, code: 'CI_RUN_QUEUED'})
            )
        })

        it('passes a named pipeline through to the execution service', async () => {
            const pipelineState = {pipelineRunId: 'p1', status: 'running', steps: []}
            mockReq.body = {source: 'script', pipeline: 'production'}
            mockPipelineExecutionService.requestPipelineRun.mockResolvedValue({
                status: 'started',
                pipeline: pipelineState,
            })

            await controller.runPipeline(mockReq as ServiceRequest, mockRes as Response)

            expect(mockPipelineExecutionService.requestPipelineRun).toHaveBeenCalledWith(
                expect.objectContaining({source: 'script', pipeline: 'production'})
            )
        })

        it('returns 400 for an unknown pipeline name', async () => {
            mockReq.body = {pipeline: 'staging'}

            await controller.runPipeline(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.badRequest).toHaveBeenCalled()
            expect(mockPipelineExecutionService.requestPipelineRun).not.toHaveBeenCalled()
        })

        it('returns 409 when tests are already running', async () => {
            const errorData = {
                code: 'TESTS_ALREADY_RUNNING',
                message: 'Tests are already running',
                currentRunId: 'existing-run-123',
                startedAt: '2025-10-26T10:00:00.000Z',
            }
            mockPipelineExecutionService.requestPipelineRun.mockRejectedValue(
                new Error(JSON.stringify(errorData))
            )

            await controller.runPipeline(mockReq as ServiceRequest, mockRes as Response)

            expect(mockRes.status).toHaveBeenCalledWith(409)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    code: 'TESTS_ALREADY_RUNNING',
                    currentRunId: 'existing-run-123',
                })
            )
        })

        it('returns 423 when CI auto-run is paused', async () => {
            const errorData = {
                code: 'CI_AUTORUN_PAUSED',
                message: 'CI auto-run is paused',
                resumeAt: '2025-10-26T12:00:00.000Z',
            }
            mockPipelineExecutionService.requestPipelineRun.mockRejectedValue(
                new Error(JSON.stringify(errorData))
            )

            await controller.runPipeline(mockReq as ServiceRequest, mockRes as Response)

            expect(mockRes.status).toHaveBeenCalledWith(423)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    code: 'CI_AUTORUN_PAUSED',
                    resumeAt: '2025-10-26T12:00:00.000Z',
                })
            )
        })

        it('returns 400 when no pipeline steps are configured', async () => {
            const errorData = {
                code: 'PIPELINE_EMPTY',
                message: 'No project tabs are configured to run in the CI pipeline',
            }
            mockPipelineExecutionService.requestPipelineRun.mockRejectedValue(
                new Error(JSON.stringify(errorData))
            )

            await controller.runPipeline(mockReq as ServiceRequest, mockRes as Response)

            expect(mockRes.status).toHaveBeenCalledWith(400)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: errorData.message,
                    code: 'PIPELINE_EMPTY',
                })
            )
        })

        it('handles unexpected errors with 500', async () => {
            const error = new Error('Something went wrong')
            mockPipelineExecutionService.requestPipelineRun.mockRejectedValue(error)

            await controller.runPipeline(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith('Error starting pipeline', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Something went wrong',
                'Failed to start pipeline',
                500
            )
        })
    })

    describe('getPipelineStatus', () => {
        it('returns the pipeline state when found', async () => {
            const pipelineState = {pipelineRunId: 'p1', status: 'completed', steps: []}
            mockReq.params = {pipelineRunId: 'p1'}
            mockPipelineExecutionService.getPipeline.mockReturnValue(pipelineState)

            await controller.getPipelineStatus(mockReq as ServiceRequest, mockRes as Response)

            expect(mockPipelineExecutionService.getPipeline).toHaveBeenCalledWith('p1')
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, pipelineState)
        })

        it('returns 404 when the pipeline run is not found', async () => {
            mockReq.params = {pipelineRunId: 'unknown'}
            mockPipelineExecutionService.getPipeline.mockReturnValue(null)

            await controller.getPipelineStatus(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.notFound).toHaveBeenCalledWith(mockRes, 'Pipeline run')
        })
    })

    describe('getCurrentPipelineStatus', () => {
        it('returns the most recent pipeline state when one exists', async () => {
            const pipelineState = {pipelineRunId: 'p1', status: 'running', steps: []}
            mockPipelineExecutionService.getCurrentPipeline.mockReturnValue(pipelineState)

            await controller.getCurrentPipelineStatus(
                mockReq as ServiceRequest,
                mockRes as Response
            )

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({success: true, data: pipelineState, queue: []})
            )
        })

        it('carries the CI queue next to the pipeline state', async () => {
            const pipelineState = {pipelineRunId: 'p1', status: 'running', steps: []}
            const queue = [{pipeline: 'production', queuedAt: '2026-01-01T00:00:00.000Z'}]
            mockPipelineExecutionService.getCurrentPipeline.mockReturnValue(pipelineState)
            mockPipelineExecutionService.getQueue.mockReturnValue(queue)

            await controller.getCurrentPipelineStatus(
                mockReq as ServiceRequest,
                mockRes as Response
            )

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({data: pipelineState, queue})
            )
        })

        it('returns the queue with data null when only a request is queued', async () => {
            const queue = [{pipeline: 'develop', queuedAt: '2026-01-01T00:00:00.000Z'}]
            mockPipelineExecutionService.getCurrentPipeline.mockReturnValue(null)
            mockPipelineExecutionService.getQueue.mockReturnValue(queue)

            await controller.getCurrentPipelineStatus(
                mockReq as ServiceRequest,
                mockRes as Response
            )

            expect(ResponseHelper.notFound).not.toHaveBeenCalled()
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({success: true, data: null, queue})
            )
        })

        it('returns 404 when no pipeline has ever run', async () => {
            mockPipelineExecutionService.getCurrentPipeline.mockReturnValue(null)

            await controller.getCurrentPipelineStatus(
                mockReq as ServiceRequest,
                mockRes as Response
            )

            expect(ResponseHelper.notFound).toHaveBeenCalledWith(mockRes, 'Pipeline run')
        })
    })
})

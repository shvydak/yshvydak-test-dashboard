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
            startPipeline: vi.fn(),
            getPipeline: vi.fn(),
            getCurrentPipeline: vi.fn(),
        }

        controller = new PipelineController(mockPipelineExecutionService)
        mockReq = createMockRequest()
        mockRes = createMockResponse()
    })

    describe('runPipeline', () => {
        it('starts the pipeline and returns its initial state', async () => {
            const pipelineState = {pipelineRunId: 'p1', status: 'running', steps: []}
            mockReq.body = {maxWorkers: 2, source: 'script'}
            mockPipelineExecutionService.startPipeline.mockResolvedValue(pipelineState)

            await controller.runPipeline(mockReq as ServiceRequest, mockRes as Response)

            expect(mockPipelineExecutionService.startPipeline).toHaveBeenCalledWith(2, 'script')
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, pipelineState)
        })

        it('returns 409 when tests are already running', async () => {
            const errorData = {
                code: 'TESTS_ALREADY_RUNNING',
                message: 'Tests are already running',
                currentRunId: 'existing-run-123',
                startedAt: '2025-10-26T10:00:00.000Z',
            }
            mockPipelineExecutionService.startPipeline.mockRejectedValue(
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
            mockPipelineExecutionService.startPipeline.mockRejectedValue(
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
            mockPipelineExecutionService.startPipeline.mockRejectedValue(
                new Error(JSON.stringify(errorData))
            )

            await controller.runPipeline(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(mockRes, errorData.message)
        })

        it('handles unexpected errors with 500', async () => {
            const error = new Error('Something went wrong')
            mockPipelineExecutionService.startPipeline.mockRejectedValue(error)

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

            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, pipelineState)
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

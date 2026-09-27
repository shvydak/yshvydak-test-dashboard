import {describe, it, expect, vi, beforeEach} from 'vitest'
import {JiraController} from '../jira.controller'
import type {ServiceRequest} from '../../types/api.types'
import type {Response} from 'express'
import {ResponseHelper} from '../../utils/response.helper'
import {Logger} from '../../utils/logger.util'

vi.mock('../../utils/response.helper')
vi.mock('../../utils/logger.util', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
}))

describe('JiraController', () => {
    let controller: JiraController
    let mockJiraService: {
        isEnabled: ReturnType<typeof vi.fn>
        getStatus: ReturnType<typeof vi.fn>
        getTicketInfo: ReturnType<typeof vi.fn>
        refreshAllKnownKeys: ReturnType<typeof vi.fn>
    }

    const createMockRequest = (overrides: Partial<ServiceRequest> = {}): ServiceRequest =>
        ({body: {}, params: {}, query: {}, ...overrides}) as ServiceRequest

    const createMockResponse = (): Response => {
        const res: any = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        }
        return res as Response
    }

    beforeEach(() => {
        mockJiraService = {
            isEnabled: vi.fn().mockReturnValue(true),
            getStatus: vi.fn(),
            getTicketInfo: vi.fn(),
            refreshAllKnownKeys: vi.fn(),
        }
        controller = new JiraController(mockJiraService as any)
        vi.clearAllMocks()
        mockJiraService.isEnabled.mockReturnValue(true)
    })

    describe('getStatus()', () => {
        it('returns the connection status on success', async () => {
            const status = {enabled: true, lastSyncAt: '2026-09-24T10:00:00.000Z'}
            mockJiraService.getStatus.mockResolvedValue(status)
            vi.mocked(ResponseHelper.success).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.getStatus(createMockRequest(), res)

            expect(ResponseHelper.success).toHaveBeenCalledWith(res, status)
        })

        it('returns 500 on service error', async () => {
            const error = new Error('DB error')
            mockJiraService.getStatus.mockRejectedValue(error)
            vi.mocked(ResponseHelper.error).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.getStatus(createMockRequest(), res)

            expect(Logger.error).toHaveBeenCalledWith('Error getting Jira connection status', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                res,
                'DB error',
                'Failed to get Jira connection status',
                500
            )
        })
    })

    describe('getTickets()', () => {
        it('returns [] without calling the service when keys is missing', async () => {
            vi.mocked(ResponseHelper.success).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.getTickets(createMockRequest({query: {}}), res)

            expect(mockJiraService.getTicketInfo).not.toHaveBeenCalled()
            expect(ResponseHelper.success).toHaveBeenCalledWith(res, [])
        })

        it('parses a comma-separated, de-duplicated key list', async () => {
            mockJiraService.getTicketInfo.mockResolvedValue([])
            vi.mocked(ResponseHelper.success).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.getTickets(createMockRequest({query: {keys: 'PB-1, PB-2,PB-1'}}), res)

            expect(mockJiraService.getTicketInfo).toHaveBeenCalledWith(['PB-1', 'PB-2'])
        })

        it('returns 500 on service error', async () => {
            const error = new Error('boom')
            mockJiraService.getTicketInfo.mockRejectedValue(error)
            vi.mocked(ResponseHelper.error).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.getTickets(createMockRequest({query: {keys: 'PB-1'}}), res)

            expect(ResponseHelper.error).toHaveBeenCalledWith(
                res,
                'boom',
                'Failed to get Jira ticket info',
                500
            )
        })

        it('rejects more than 200 keys with 400, without calling the service', async () => {
            const manyKeys = Array.from({length: 201}, (_, i) => `PB-${i + 1}`).join(',')
            vi.mocked(ResponseHelper.badRequest).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.getTickets(createMockRequest({query: {keys: manyKeys}}), res)

            expect(mockJiraService.getTicketInfo).not.toHaveBeenCalled()
            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                res,
                expect.stringContaining('Too many keys')
            )
        })

        it('accepts exactly 200 keys', async () => {
            const maxKeys = Array.from({length: 200}, (_, i) => `PB-${i + 1}`).join(',')
            mockJiraService.getTicketInfo.mockResolvedValue([])
            vi.mocked(ResponseHelper.success).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.getTickets(createMockRequest({query: {keys: maxKeys}}), res)

            expect(mockJiraService.getTicketInfo).toHaveBeenCalledTimes(1)
        })
    })

    describe('refresh()', () => {
        it('returns 400 when the integration is not configured', async () => {
            mockJiraService.isEnabled.mockReturnValue(false)
            vi.mocked(ResponseHelper.badRequest).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.refresh(createMockRequest(), res)

            expect(mockJiraService.refreshAllKnownKeys).not.toHaveBeenCalled()
            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                res,
                expect.stringContaining('not configured')
            )
        })

        it('refreshes and returns the sync result plus last sync time on success', async () => {
            mockJiraService.refreshAllKnownKeys.mockResolvedValue({
                checked: 2,
                updated: 2,
                failed: 0,
            })
            mockJiraService.getStatus.mockResolvedValue({
                enabled: true,
                lastSyncAt: '2026-09-24T10:30:00.000Z',
            })
            vi.mocked(ResponseHelper.success).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.refresh(createMockRequest(), res)

            expect(ResponseHelper.success).toHaveBeenCalledWith(res, {
                checked: 2,
                updated: 2,
                failed: 0,
                lastSyncAt: '2026-09-24T10:30:00.000Z',
            })
        })

        it('returns 500 on service error', async () => {
            const error = new Error('boom')
            mockJiraService.refreshAllKnownKeys.mockRejectedValue(error)
            vi.mocked(ResponseHelper.error).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.refresh(createMockRequest(), res)

            expect(ResponseHelper.error).toHaveBeenCalledWith(
                res,
                'boom',
                'Failed to refresh Jira tickets',
                500
            )
        })
    })
})

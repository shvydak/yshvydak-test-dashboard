import {describe, it, expect, vi, beforeEach} from 'vitest'
import {SettingsController} from '../settings.controller'
import type {ServiceRequest} from '../../types/api.types'
import type {Response} from 'express'
import {ResponseHelper} from '../../utils/response.helper'
import {Logger} from '../../utils/logger.util'
import {DiskThresholds} from '../../repositories/settings.repository'

vi.mock('../../services/settings.service')
vi.mock('../../utils/response.helper')
vi.mock('../../utils/logger.util', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
}))

describe('SettingsController', () => {
    let controller: SettingsController
    let mockSettingsService: any

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
        mockSettingsService = {
            getTestExecutionSettings: vi.fn(),
            getDiskThresholds: vi.fn(),
            setDiskThresholds: vi.fn(),
            setGlobalPlaywrightProject: vi.fn(),
        }
        controller = new SettingsController(mockSettingsService)
        vi.clearAllMocks()
    })

    describe('getDiskThresholds()', () => {
        const mockThresholds: DiskThresholds = {warningPercent: 20, criticalPercent: 5}

        it('should return thresholds on success', async () => {
            mockSettingsService.getDiskThresholds.mockResolvedValue(mockThresholds)
            vi.mocked(ResponseHelper.success).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.getDiskThresholds(createMockRequest(), res)

            expect(mockSettingsService.getDiskThresholds).toHaveBeenCalledTimes(1)
            expect(ResponseHelper.success).toHaveBeenCalledWith(res, mockThresholds)
        })

        it('should return 500 on service error', async () => {
            const error = new Error('DB error')
            mockSettingsService.getDiskThresholds.mockRejectedValue(error)
            vi.mocked(ResponseHelper.error).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.getDiskThresholds(createMockRequest(), res)

            expect(Logger.error).toHaveBeenCalledWith('Error getting disk thresholds', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                res,
                'DB error',
                'Failed to get disk thresholds',
                500
            )
        })

        it('should handle non-Error exceptions', async () => {
            mockSettingsService.getDiskThresholds.mockRejectedValue('string error')
            vi.mocked(ResponseHelper.error).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.getDiskThresholds(createMockRequest(), res)

            expect(ResponseHelper.error).toHaveBeenCalledWith(
                res,
                'Unknown error',
                'Failed to get disk thresholds',
                500
            )
        })
    })

    describe('updateDiskThresholds()', () => {
        const validBody = {warningPercent: 30, criticalPercent: 10}
        const savedThresholds: DiskThresholds = {warningPercent: 30, criticalPercent: 10}

        it('should save and return thresholds on valid input', async () => {
            mockSettingsService.setDiskThresholds.mockResolvedValue(savedThresholds)
            vi.mocked(ResponseHelper.success).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.updateDiskThresholds(createMockRequest({body: validBody}), res)

            expect(mockSettingsService.setDiskThresholds).toHaveBeenCalledWith(30, 10)
            expect(ResponseHelper.success).toHaveBeenCalledWith(res, savedThresholds)
        })

        it('should return 400 when warningPercent is missing', async () => {
            vi.mocked(ResponseHelper.badRequest).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.updateDiskThresholds(
                createMockRequest({body: {criticalPercent: 10}}),
                res
            )

            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                res,
                'warningPercent and criticalPercent must be numbers'
            )
            expect(mockSettingsService.setDiskThresholds).not.toHaveBeenCalled()
        })

        it('should return 400 when criticalPercent is missing', async () => {
            vi.mocked(ResponseHelper.badRequest).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.updateDiskThresholds(
                createMockRequest({body: {warningPercent: 30}}),
                res
            )

            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                res,
                'warningPercent and criticalPercent must be numbers'
            )
        })

        it('should return 400 when warningPercent is a string', async () => {
            vi.mocked(ResponseHelper.badRequest).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.updateDiskThresholds(
                createMockRequest({body: {warningPercent: '30', criticalPercent: 10}}),
                res
            )

            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                res,
                'warningPercent and criticalPercent must be numbers'
            )
        })

        it('should return 400 when warningPercent is 0 (below range)', async () => {
            vi.mocked(ResponseHelper.badRequest).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.updateDiskThresholds(
                createMockRequest({body: {warningPercent: 0, criticalPercent: 5}}),
                res
            )

            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                res,
                'warningPercent must be between 1 and 99'
            )
        })

        it('should return 400 when warningPercent is 100 (above range)', async () => {
            vi.mocked(ResponseHelper.badRequest).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.updateDiskThresholds(
                createMockRequest({body: {warningPercent: 100, criticalPercent: 5}}),
                res
            )

            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                res,
                'warningPercent must be between 1 and 99'
            )
        })

        it('should return 400 when criticalPercent is out of range', async () => {
            vi.mocked(ResponseHelper.badRequest).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.updateDiskThresholds(
                createMockRequest({body: {warningPercent: 30, criticalPercent: 0}}),
                res
            )

            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                res,
                'criticalPercent must be between 1 and 99'
            )
        })

        it('should return 400 when service rejects critical >= warning', async () => {
            const error = new Error('Critical threshold must be lower than warning threshold')
            mockSettingsService.setDiskThresholds.mockRejectedValue(error)
            vi.mocked(ResponseHelper.badRequest).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.updateDiskThresholds(
                createMockRequest({body: {warningPercent: 20, criticalPercent: 20}}),
                res
            )

            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(res, error.message)
        })

        it('should return 500 on unexpected service error', async () => {
            const error = new Error('DB connection lost')
            mockSettingsService.setDiskThresholds.mockRejectedValue(error)
            vi.mocked(ResponseHelper.error).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.updateDiskThresholds(createMockRequest({body: validBody}), res)

            expect(Logger.error).toHaveBeenCalledWith('Error updating disk thresholds', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                res,
                'DB connection lost',
                'Failed to update disk thresholds',
                500
            )
        })

        it('should accept boundary values (1 and 99)', async () => {
            mockSettingsService.setDiskThresholds.mockResolvedValue({
                warningPercent: 99,
                criticalPercent: 1,
            })
            vi.mocked(ResponseHelper.success).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.updateDiskThresholds(
                createMockRequest({body: {warningPercent: 99, criticalPercent: 1}}),
                res
            )

            expect(mockSettingsService.setDiskThresholds).toHaveBeenCalledWith(99, 1)
        })
    })
})

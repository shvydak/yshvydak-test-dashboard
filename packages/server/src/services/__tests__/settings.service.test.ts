import {describe, it, expect, beforeEach, vi, Mock} from 'vitest'
import {SettingsService} from '../settings.service'
import {DiskThresholds} from '../../repositories/settings.repository'
import {Logger} from '../../utils/logger.util'

vi.mock('../../utils/logger.util', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
}))

describe('SettingsService', () => {
    let service: SettingsService
    let mockRepository: {
        getGlobalPlaywrightProject: Mock
        setGlobalPlaywrightProject: Mock
        getDiskThresholds: Mock
        setDiskThresholds: Mock
    }
    let mockPlaywrightService: {
        getAvailableProjects: Mock
    }

    const defaultThresholds: DiskThresholds = {
        warningPercent: 20,
        criticalPercent: 5,
    }

    beforeEach(() => {
        mockRepository = {
            getGlobalPlaywrightProject: vi.fn(),
            setGlobalPlaywrightProject: vi.fn(),
            getDiskThresholds: vi.fn(),
            setDiskThresholds: vi.fn(),
        }
        mockPlaywrightService = {
            getAvailableProjects: vi.fn(),
        }
        service = new SettingsService(mockRepository as any, mockPlaywrightService as any)
        vi.clearAllMocks()
    })

    describe('getDiskThresholds()', () => {
        it('should return thresholds from repository', async () => {
            mockRepository.getDiskThresholds.mockResolvedValue(defaultThresholds)

            const result = await service.getDiskThresholds()

            expect(result).toEqual(defaultThresholds)
            expect(mockRepository.getDiskThresholds).toHaveBeenCalledTimes(1)
        })

        it('should return custom thresholds', async () => {
            const custom: DiskThresholds = {warningPercent: 30, criticalPercent: 10}
            mockRepository.getDiskThresholds.mockResolvedValue(custom)

            const result = await service.getDiskThresholds()

            expect(result.warningPercent).toBe(30)
            expect(result.criticalPercent).toBe(10)
        })
    })

    describe('setDiskThresholds()', () => {
        it('should save and return the new thresholds', async () => {
            mockRepository.setDiskThresholds.mockResolvedValue(undefined)

            const result = await service.setDiskThresholds(30, 10)

            expect(result).toEqual({warningPercent: 30, criticalPercent: 10})
            expect(mockRepository.setDiskThresholds).toHaveBeenCalledWith({
                warningPercent: 30,
                criticalPercent: 10,
            })
        })

        it('should log the update', async () => {
            mockRepository.setDiskThresholds.mockResolvedValue(undefined)

            await service.setDiskThresholds(25, 8)

            expect(Logger.info).toHaveBeenCalledWith(
                'Disk thresholds updated: warning=25%, critical=8%'
            )
        })

        it('should throw when critical >= warning', async () => {
            await expect(service.setDiskThresholds(20, 20)).rejects.toThrow(
                'Critical threshold must be lower than warning threshold'
            )
        })

        it('should throw when critical > warning', async () => {
            await expect(service.setDiskThresholds(10, 20)).rejects.toThrow(
                'Critical threshold must be lower than warning threshold'
            )
        })

        it('should not call repository when validation fails', async () => {
            await expect(service.setDiskThresholds(15, 15)).rejects.toThrow()

            expect(mockRepository.setDiskThresholds).not.toHaveBeenCalled()
        })

        it('should accept critical = warning - 1 (boundary)', async () => {
            mockRepository.setDiskThresholds.mockResolvedValue(undefined)

            const result = await service.setDiskThresholds(20, 19)

            expect(result).toEqual({warningPercent: 20, criticalPercent: 19})
        })

        it('should accept minimum valid values', async () => {
            mockRepository.setDiskThresholds.mockResolvedValue(undefined)

            const result = await service.setDiskThresholds(2, 1)

            expect(result).toEqual({warningPercent: 2, criticalPercent: 1})
        })
    })
})

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
        getProjectTabConfigs: Mock
        setProjectTabConfigs: Mock
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
            getProjectTabConfigs: vi.fn(),
            setProjectTabConfigs: vi.fn(),
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

    describe('setProjectTabConfigs normalization', () => {
        it('should fall back displayName to project value when displayName is absent (empty string)', async () => {
            mockRepository.setProjectTabConfigs.mockResolvedValue(undefined)

            const result = await service.setProjectTabConfigs([
                {project: 'Frontend', displayName: '', visible: true},
            ])

            expect(result[0].displayName).toBe('Frontend')
            expect(result[0].project).toBe('Frontend')
        })

        it('should trim whitespace from project field', async () => {
            mockRepository.setProjectTabConfigs.mockResolvedValue(undefined)

            const result = await service.setProjectTabConfigs([
                {project: '  Backend  ', displayName: 'Backend Tests', visible: true},
            ])

            expect(result[0].project).toBe('Backend')
        })

        it('should coerce truthy non-boolean visible to boolean true', async () => {
            mockRepository.setProjectTabConfigs.mockResolvedValue(undefined)

            const input = [
                {project: 'A', displayName: 'A', visible: 'true' as any},
                {project: 'B', displayName: 'B', visible: 1 as any},
            ]
            const result = await service.setProjectTabConfigs(input)

            expect(result[0].visible).toBe(true)
            expect(typeof result[0].visible).toBe('boolean')
            expect(result[1].visible).toBe(true)
            expect(typeof result[1].visible).toBe('boolean')
        })

        it('should persist empty array without error', async () => {
            mockRepository.setProjectTabConfigs.mockResolvedValue(undefined)

            const result = await service.setProjectTabConfigs([])

            expect(result).toEqual([])
            expect(mockRepository.setProjectTabConfigs).toHaveBeenCalledWith([])
        })
    })
})

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
            getDefaultProjectTab: vi.fn(),
            setDefaultProjectTab: vi.fn(),
            getJiraSettings: vi.fn(),
            setJiraSettings: vi.fn(),
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

    describe('getDefaultProjectTab()', () => {
        it('should return project on success', async () => {
            mockSettingsService.getDefaultProjectTab.mockResolvedValue('API_Tests')
            vi.mocked(ResponseHelper.success).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.getDefaultProjectTab(createMockRequest(), res)

            expect(ResponseHelper.success).toHaveBeenCalledWith(res, {project: 'API_Tests'})
        })

        it('should return 500 on service error', async () => {
            const error = new Error('DB error')
            mockSettingsService.getDefaultProjectTab.mockRejectedValue(error)
            vi.mocked(ResponseHelper.error).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.getDefaultProjectTab(createMockRequest(), res)

            expect(ResponseHelper.error).toHaveBeenCalledWith(
                res,
                'DB error',
                'Failed to get default project tab',
                500
            )
        })
    })

    describe('updateDefaultProjectTab()', () => {
        it('should save and return project on valid input', async () => {
            mockSettingsService.setDefaultProjectTab.mockResolvedValue({project: 'API_Tests'})
            vi.mocked(ResponseHelper.success).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.updateDefaultProjectTab(
                createMockRequest({body: {project: 'API_Tests'}}),
                res
            )

            expect(mockSettingsService.setDefaultProjectTab).toHaveBeenCalledWith('API_Tests')
            expect(ResponseHelper.success).toHaveBeenCalledWith(res, {project: 'API_Tests'})
        })

        it('should return 400 when project is not a string', async () => {
            vi.mocked(ResponseHelper.badRequest).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.updateDefaultProjectTab(createMockRequest({body: {project: 1}}), res)

            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(res, 'Project must be a string')
            expect(mockSettingsService.setDefaultProjectTab).not.toHaveBeenCalled()
        })

        it('should return 400 for unknown Playwright project', async () => {
            mockSettingsService.setDefaultProjectTab.mockRejectedValue(
                new Error('Unknown Playwright project: Nope')
            )
            vi.mocked(ResponseHelper.badRequest).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.updateDefaultProjectTab(
                createMockRequest({body: {project: 'Nope'}}),
                res
            )

            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                res,
                'Unknown Playwright project: Nope'
            )
        })
    })

    describe('getJiraSettings()', () => {
        it('should return Jira settings on success', async () => {
            const settings = {
                baseUrl: 'https://x.atlassian.net/browse/',
                chipAlignment: 'right',
                tagMode: 'all',
            }
            mockSettingsService.getJiraSettings.mockResolvedValue(settings)
            vi.mocked(ResponseHelper.success).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.getJiraSettings(createMockRequest(), res)

            expect(ResponseHelper.success).toHaveBeenCalledWith(res, settings)
        })

        it('should return 500 when the service throws', async () => {
            mockSettingsService.getJiraSettings.mockRejectedValue(new Error('db down'))
            vi.mocked(ResponseHelper.error).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.getJiraSettings(createMockRequest(), res)

            expect(ResponseHelper.error).toHaveBeenCalledWith(
                res,
                'db down',
                'Failed to get Jira settings',
                500
            )
        })
    })

    describe('updateJiraSettings()', () => {
        const saved = {
            baseUrl: 'https://x.atlassian.net/browse/',
            chipAlignment: 'left',
            tagMode: 'tickets',
        }
        const body = (overrides: Record<string, unknown> = {}) => ({
            baseUrl: '',
            chipAlignment: 'left',
            tagMode: 'tickets',
            ...overrides,
        })
        const put = async (requestBody: unknown) => {
            vi.mocked(ResponseHelper.badRequest).mockReturnValue({} as any)
            vi.mocked(ResponseHelper.success).mockReturnValue({} as any)
            const res = createMockResponse()
            await controller.updateJiraSettings(createMockRequest({body: requestBody as any}), res)
            return res
        }

        it('should trim baseUrl, save and return settings on valid input', async () => {
            mockSettingsService.setJiraSettings.mockResolvedValue(saved)

            const res = await put(body({baseUrl: '  https://x.atlassian.net/browse  '}))

            expect(mockSettingsService.setJiraSettings).toHaveBeenCalledWith(
                'https://x.atlassian.net/browse',
                'left',
                'tickets'
            )
            expect(ResponseHelper.success).toHaveBeenCalledWith(res, saved)
        })

        it('should accept an empty baseUrl (disables links)', async () => {
            mockSettingsService.setJiraSettings.mockResolvedValue({...saved, baseUrl: ''})

            await put(body({baseUrl: '   ', chipAlignment: 'right'}))

            expect(mockSettingsService.setJiraSettings).toHaveBeenCalledWith('', 'right', 'tickets')
            expect(ResponseHelper.badRequest).not.toHaveBeenCalled()
        })

        it.each(['left', 'right', 'below'])(
            'should accept chipAlignment %s',
            async (chipAlignment) => {
                mockSettingsService.setJiraSettings.mockResolvedValue({...saved, chipAlignment})

                await put(body({chipAlignment}))

                expect(mockSettingsService.setJiraSettings).toHaveBeenCalledWith(
                    '',
                    chipAlignment,
                    'tickets'
                )
                expect(ResponseHelper.badRequest).not.toHaveBeenCalled()
            }
        )

        it.each(['tickets', 'all'])('should accept tagMode %s', async (tagMode) => {
            mockSettingsService.setJiraSettings.mockResolvedValue({...saved, tagMode})

            await put(body({tagMode}))

            expect(mockSettingsService.setJiraSettings).toHaveBeenCalledWith('', 'left', tagMode)
            expect(ResponseHelper.badRequest).not.toHaveBeenCalled()
        })

        it.each(['everything', 'ALL', 'Tickets', '', null, undefined, 1, true, ['all']])(
            'should return 400 for tagMode %j',
            async (tagMode) => {
                const res = await put(body({tagMode}))

                expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                    res,
                    "tagMode must be 'tickets' or 'all'"
                )
                expect(mockSettingsService.setJiraSettings).not.toHaveBeenCalled()
            }
        )

        it('should return 400 when tagMode is missing from the body', async () => {
            const res = await put({baseUrl: '', chipAlignment: 'left'})

            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                res,
                "tagMode must be 'tickets' or 'all'"
            )
            expect(mockSettingsService.setJiraSettings).not.toHaveBeenCalled()
        })

        it('should return 400 when baseUrl is not a string', async () => {
            const res = await put(body({baseUrl: 42}))

            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(res, 'baseUrl must be a string')
            expect(mockSettingsService.setJiraSettings).not.toHaveBeenCalled()
        })

        it('should return 400 when the body is missing', async () => {
            const res = await put(undefined)

            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(res, 'baseUrl must be a string')
        })

        it.each(['center', 'Below', '', undefined, 1])(
            'should return 400 for chipAlignment %j',
            async (chipAlignment) => {
                const res = await put(body({chipAlignment}))

                expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                    res,
                    "chipAlignment must be 'left', 'right' or 'below'"
                )
                expect(mockSettingsService.setJiraSettings).not.toHaveBeenCalled()
            }
        )

        it.each([
            'not a url',
            'ftp://x.com/browse/',
            'javascript:alert(1)',
            'atlassian.net/browse/',
        ])('should return 400 for invalid baseUrl %j', async (baseUrl) => {
            const res = await put(body({baseUrl}))

            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                res,
                'baseUrl must be empty or a valid http(s) URL'
            )
            expect(mockSettingsService.setJiraSettings).not.toHaveBeenCalled()
        })

        it('should return 500 when the service throws', async () => {
            mockSettingsService.setJiraSettings.mockRejectedValue(new Error('write failed'))
            vi.mocked(ResponseHelper.error).mockReturnValue({} as any)
            const res = createMockResponse()

            await controller.updateJiraSettings(createMockRequest({body: body()}), res)

            expect(ResponseHelper.error).toHaveBeenCalledWith(
                res,
                'write failed',
                'Failed to update Jira settings',
                500
            )
        })
    })
})

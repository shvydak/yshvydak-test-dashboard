import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {renderHook, waitFor, act} from '@testing-library/react'
import {
    useProjectTabs,
    getProjectWorkersOverride,
    resolveDefaultProjectTab,
} from '../useProjectTabs'

// Mock authFetch so we can control responses without a real server
vi.mock('@features/authentication/utils/authFetch', () => ({
    authGet: vi.fn(),
    authPut: vi.fn(),
}))

// Mock config to avoid VITE env lookup
vi.mock('@config/environment.config', () => ({
    config: {
        api: {
            baseUrl: 'http://localhost:3000/api',
        },
    },
}))

import {authGet, authPut} from '@features/authentication/utils/authFetch'

const mockAuthGet = authGet as ReturnType<typeof vi.fn>
const mockAuthPut = authPut as ReturnType<typeof vi.fn>

function makeResponse(body: unknown, ok = true): Response {
    return {
        ok,
        json: () => Promise.resolve(body),
    } as unknown as Response
}

function mockTabsLoad(savedConfigs: unknown[], availableProjects: string[], defaultProject = '') {
    mockAuthGet.mockImplementation((url: string) => {
        if (url.includes('/settings/project-tabs')) {
            return Promise.resolve(makeResponse({data: savedConfigs}))
        }
        if (url.includes('/tests/projects')) {
            return Promise.resolve(makeResponse({data: availableProjects}))
        }
        if (url.includes('/settings/default-project-tab')) {
            return Promise.resolve(makeResponse({data: {project: defaultProject}}))
        }
        return Promise.resolve(makeResponse({}, false))
    })
}

describe('resolveDefaultProjectTab', () => {
    it('returns configured default when that tab is visible', () => {
        expect(
            resolveDefaultProjectTab([{project: 'API_Tests'}, {project: 'Staging'}], 'Staging')
        ).toBe('Staging')
    })

    it('ignores configured default when that tab is not visible', () => {
        expect(resolveDefaultProjectTab([{project: 'API_Tests'}], 'Hidden')).toBe('API_Tests')
    })

    it('returns the sole visible tab when no default is configured', () => {
        expect(resolveDefaultProjectTab([{project: 'Only'}], '')).toBe('Only')
    })

    it('returns null when multiple tabs and no default', () => {
        expect(resolveDefaultProjectTab([{project: 'A'}, {project: 'B'}], '')).toBeNull()
    })

    it('returns null when multiple tabs and default is not among them', () => {
        expect(resolveDefaultProjectTab([{project: 'A'}, {project: 'B'}], 'C')).toBeNull()
    })

    it('returns null when there are no visible tabs', () => {
        expect(resolveDefaultProjectTab([], 'API_Tests')).toBeNull()
        expect(resolveDefaultProjectTab([], '')).toBeNull()
    })
})

describe('useProjectTabs', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('merge logic', () => {
        it('should append new available project not in saved configs with visible=true and displayName=projectName', async () => {
            const savedConfigs = [{project: 'Frontend', displayName: 'FE Tests', visible: true}]
            const availableProjects = ['Frontend', 'Backend']

            mockTabsLoad(savedConfigs, availableProjects)

            const {result} = renderHook(() => useProjectTabs())

            await waitFor(() => expect(result.current.isLoading).toBe(false))

            expect(result.current.tabs).toHaveLength(2)
            const backendTab = result.current.tabs.find((t) => t.project === 'Backend')
            expect(backendTab).toBeDefined()
            expect(backendTab?.visible).toBe(true)
            expect(backendTab?.displayName).toBe('Backend')
        })

        it('should not produce duplicates when available projects match saved configs', async () => {
            const savedConfigs = [
                {project: 'Frontend', displayName: 'FE', visible: true},
                {project: 'Backend', displayName: 'BE', visible: false},
            ]
            const availableProjects = ['Frontend', 'Backend']

            mockTabsLoad(savedConfigs, availableProjects)

            const {result} = renderHook(() => useProjectTabs())

            await waitFor(() => expect(result.current.isLoading).toBe(false))

            expect(result.current.tabs).toHaveLength(2)
        })

        it('should retain saved entry even if project is no longer in available list', async () => {
            const savedConfigs = [
                {project: 'Frontend', displayName: 'FE', visible: true},
                {project: 'Legacy', displayName: 'Old Suite', visible: false},
            ]
            const availableProjects = ['Frontend']

            mockTabsLoad(savedConfigs, availableProjects)

            const {result} = renderHook(() => useProjectTabs())

            await waitFor(() => expect(result.current.isLoading).toBe(false))

            expect(result.current.tabs).toHaveLength(2)
            const legacyTab = result.current.tabs.find((t) => t.project === 'Legacy')
            expect(legacyTab).toBeDefined()
        })

        it('should result in empty tabs when both fetches return empty', async () => {
            mockTabsLoad([], [])

            const {result} = renderHook(() => useProjectTabs())

            await waitFor(() => expect(result.current.isLoading).toBe(false))

            expect(result.current.tabs).toEqual([])
            expect(result.current.error).toBeNull()
        })

        it('should set error and leave tabs empty when settings fetch fails', async () => {
            mockAuthGet.mockImplementation((url: string) => {
                if (url.includes('/settings/project-tabs')) {
                    return Promise.resolve(makeResponse({}, false))
                }
                if (url.includes('/tests/projects')) {
                    return Promise.resolve(makeResponse({data: ['Frontend']}))
                }
                if (url.includes('/settings/default-project-tab')) {
                    return Promise.resolve(makeResponse({data: {project: ''}}))
                }
                return Promise.resolve(makeResponse({}, false))
            })

            const {result} = renderHook(() => useProjectTabs())

            await waitFor(() => expect(result.current.isLoading).toBe(false))

            expect(result.current.error).toBeTruthy()
            expect(result.current.tabs).toEqual([])
        })

        it('visibleTabs should contain only tabs where visible is true', async () => {
            const savedConfigs = [
                {project: 'Frontend', displayName: 'FE', visible: true},
                {project: 'Backend', displayName: 'BE', visible: false},
                {project: 'Mobile', displayName: 'Mobile', visible: true},
            ]

            mockTabsLoad(savedConfigs, ['Frontend', 'Backend', 'Mobile'])

            const {result} = renderHook(() => useProjectTabs())

            await waitFor(() => expect(result.current.isLoading).toBe(false))

            expect(result.current.visibleTabs).toHaveLength(2)
            expect(result.current.visibleTabs.every((t) => t.visible)).toBe(true)
            expect(result.current.visibleTabs.map((t) => t.project)).toEqual(['Frontend', 'Mobile'])
        })
    })

    describe('defaultProjectTab', () => {
        it('loads the configured default from the API', async () => {
            mockTabsLoad(
                [{project: 'API_Tests', displayName: 'API', visible: true}],
                ['API_Tests'],
                'API_Tests'
            )

            const {result} = renderHook(() => useProjectTabs())

            await waitFor(() => expect(result.current.isLoading).toBe(false))

            expect(result.current.defaultProjectTab).toBe('API_Tests')
        })

        it('soft-fails to empty default when the default-tab endpoint fails', async () => {
            mockAuthGet.mockImplementation((url: string) => {
                if (url.includes('/settings/project-tabs')) {
                    return Promise.resolve(
                        makeResponse({
                            data: [{project: 'API_Tests', displayName: 'API', visible: true}],
                        })
                    )
                }
                if (url.includes('/tests/projects')) {
                    return Promise.resolve(makeResponse({data: ['API_Tests']}))
                }
                if (url.includes('/settings/default-project-tab')) {
                    return Promise.resolve(makeResponse({}, false))
                }
                return Promise.resolve(makeResponse({}, false))
            })

            const {result} = renderHook(() => useProjectTabs())

            await waitFor(() => expect(result.current.isLoading).toBe(false))

            expect(result.current.tabs).toHaveLength(1)
            expect(result.current.defaultProjectTab).toBe('')
            expect(result.current.error).toBeNull()
        })

        it('persists a new default via setDefaultProjectTab', async () => {
            mockTabsLoad(
                [{project: 'API_Tests', displayName: 'API', visible: true}],
                ['API_Tests'],
                ''
            )

            const {result} = renderHook(() => useProjectTabs())
            await waitFor(() => expect(result.current.isLoading).toBe(false))

            mockAuthPut.mockResolvedValueOnce(makeResponse({data: {project: 'API_Tests'}}))

            await act(async () => {
                await result.current.setDefaultProjectTab('API_Tests')
            })

            expect(mockAuthPut).toHaveBeenCalledWith(
                'http://localhost:3000/api/settings/default-project-tab',
                {project: 'API_Tests'}
            )
            expect(result.current.defaultProjectTab).toBe('API_Tests')
        })
    })

    describe('getProjectWorkersOverride', () => {
        it('returns undefined when called without a project', () => {
            expect(getProjectWorkersOverride(undefined)).toBeUndefined()
        })

        it('returns undefined for a project that has no override', async () => {
            const savedConfigs = [{project: 'NoOverride', displayName: 'NoOverride', visible: true}]

            mockTabsLoad(savedConfigs, ['NoOverride'])

            const {result} = renderHook(() => useProjectTabs())
            await waitFor(() => expect(result.current.isLoading).toBe(false))

            expect(getProjectWorkersOverride('NoOverride')).toBeUndefined()
        })

        it('returns undefined for a project the cache has never seen', () => {
            expect(getProjectWorkersOverride('NeverLoaded')).toBeUndefined()
        })

        it('returns the workers override once the hook loads tabs containing it', async () => {
            const savedConfigs = [
                {project: 'API_Tests', displayName: 'API Tests', visible: true, workers: 4},
            ]

            mockTabsLoad(savedConfigs, ['API_Tests'])

            const {result} = renderHook(() => useProjectTabs())
            await waitFor(() => expect(result.current.isLoading).toBe(false))

            expect(getProjectWorkersOverride('API_Tests')).toBe(4)
        })

        it('reflects the new value after updateTabs() saves a changed override', async () => {
            const savedConfigs = [
                {project: 'API_Tests', displayName: 'API Tests', visible: true, workers: 4},
            ]

            mockTabsLoad(savedConfigs, ['API_Tests'])

            const {result} = renderHook(() => useProjectTabs())
            await waitFor(() => expect(result.current.isLoading).toBe(false))
            expect(getProjectWorkersOverride('API_Tests')).toBe(4)

            const updatedConfigs = [
                {
                    project: 'API_Tests',
                    displayName: 'API Tests',
                    visible: true,
                    inPipeline: false,
                    stopPipelineOnFailure: false,
                    workers: 8,
                },
            ]
            mockAuthPut.mockResolvedValueOnce(makeResponse({data: updatedConfigs}))

            await act(async () => {
                await result.current.updateTabs(updatedConfigs)
            })

            expect(getProjectWorkersOverride('API_Tests')).toBe(8)
        })
    })
})

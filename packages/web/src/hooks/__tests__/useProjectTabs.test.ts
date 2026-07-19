import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {renderHook, waitFor, act} from '@testing-library/react'
import {useProjectTabs, getProjectWorkersOverride} from '../useProjectTabs'

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

            mockAuthGet
                .mockResolvedValueOnce(makeResponse({data: savedConfigs}))
                .mockResolvedValueOnce(makeResponse({data: availableProjects}))

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

            mockAuthGet
                .mockResolvedValueOnce(makeResponse({data: savedConfigs}))
                .mockResolvedValueOnce(makeResponse({data: availableProjects}))

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

            mockAuthGet
                .mockResolvedValueOnce(makeResponse({data: savedConfigs}))
                .mockResolvedValueOnce(makeResponse({data: availableProjects}))

            const {result} = renderHook(() => useProjectTabs())

            await waitFor(() => expect(result.current.isLoading).toBe(false))

            expect(result.current.tabs).toHaveLength(2)
            const legacyTab = result.current.tabs.find((t) => t.project === 'Legacy')
            expect(legacyTab).toBeDefined()
        })

        it('should result in empty tabs when both fetches return empty', async () => {
            mockAuthGet
                .mockResolvedValueOnce(makeResponse({data: []}))
                .mockResolvedValueOnce(makeResponse({data: []}))

            const {result} = renderHook(() => useProjectTabs())

            await waitFor(() => expect(result.current.isLoading).toBe(false))

            expect(result.current.tabs).toEqual([])
            expect(result.current.error).toBeNull()
        })

        it('should set error and leave tabs empty when settings fetch fails', async () => {
            mockAuthGet
                .mockResolvedValueOnce(makeResponse({}, false))
                .mockResolvedValueOnce(makeResponse({data: ['Frontend']}))

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

            mockAuthGet
                .mockResolvedValueOnce(makeResponse({data: savedConfigs}))
                .mockResolvedValueOnce(makeResponse({data: ['Frontend', 'Backend', 'Mobile']}))

            const {result} = renderHook(() => useProjectTabs())

            await waitFor(() => expect(result.current.isLoading).toBe(false))

            expect(result.current.visibleTabs).toHaveLength(2)
            expect(result.current.visibleTabs.every((t) => t.visible)).toBe(true)
            expect(result.current.visibleTabs.map((t) => t.project)).toEqual(['Frontend', 'Mobile'])
        })
    })

    describe('getProjectWorkersOverride', () => {
        it('returns undefined when called without a project', () => {
            expect(getProjectWorkersOverride(undefined)).toBeUndefined()
        })

        it('returns undefined for a project that has no override', async () => {
            const savedConfigs = [{project: 'NoOverride', displayName: 'NoOverride', visible: true}]

            mockAuthGet
                .mockResolvedValueOnce(makeResponse({data: savedConfigs}))
                .mockResolvedValueOnce(makeResponse({data: ['NoOverride']}))

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

            mockAuthGet
                .mockResolvedValueOnce(makeResponse({data: savedConfigs}))
                .mockResolvedValueOnce(makeResponse({data: ['API_Tests']}))

            const {result} = renderHook(() => useProjectTabs())
            await waitFor(() => expect(result.current.isLoading).toBe(false))

            expect(getProjectWorkersOverride('API_Tests')).toBe(4)
        })

        it('reflects the new value after updateTabs() saves a changed override', async () => {
            const savedConfigs = [
                {project: 'API_Tests', displayName: 'API Tests', visible: true, workers: 4},
            ]

            mockAuthGet
                .mockResolvedValueOnce(makeResponse({data: savedConfigs}))
                .mockResolvedValueOnce(makeResponse({data: ['API_Tests']}))

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

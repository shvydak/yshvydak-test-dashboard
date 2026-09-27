import {describe, it, expect, vi, beforeEach} from 'vitest'
import {renderHook, waitFor, act} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {createElement} from 'react'
import {useJiraStatus} from '../useJiraStatus'

vi.mock('@features/authentication/utils/authFetch', () => ({
    authGet: vi.fn(),
    authPost: vi.fn(),
}))

vi.mock('@config/environment.config', () => ({
    config: {
        api: {
            baseUrl: 'http://localhost:3000/api',
        },
    },
}))

import {authGet, authPost} from '@features/authentication/utils/authFetch'

const mockAuthGet = authGet as ReturnType<typeof vi.fn>
const mockAuthPost = authPost as ReturnType<typeof vi.fn>

function makeResponse(body: unknown, ok = true) {
    return {
        ok,
        json: () => Promise.resolve(body),
    } as unknown as Response
}

let queryClient: QueryClient
function wrapper({children}: {children: React.ReactNode}) {
    return createElement(QueryClientProvider, {client: queryClient}, children)
}

describe('useJiraStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}})
    })

    it('returns disabled/never-synced defaults while loading', () => {
        mockAuthGet.mockReturnValue(new Promise(() => {})) // never resolves

        const {result} = renderHook(() => useJiraStatus(), {wrapper})

        expect(result.current.status).toEqual({
            enabled: false,
            lastSyncAt: null,
            lastSyncOk: null,
            lastSyncError: null,
        })
        expect(result.current.isLoading).toBe(true)
    })

    it('returns the fetched connection status, including the last attempt outcome', async () => {
        mockAuthGet.mockResolvedValue(
            makeResponse({
                data: {
                    enabled: true,
                    lastSyncAt: '2026-09-24T10:00:00.000Z',
                    lastSyncOk: true,
                    lastSyncError: null,
                },
            })
        )

        const {result} = renderHook(() => useJiraStatus(), {wrapper})

        await waitFor(() =>
            expect(result.current.status).toEqual({
                enabled: true,
                lastSyncAt: '2026-09-24T10:00:00.000Z',
                lastSyncOk: true,
                lastSyncError: null,
            })
        )
    })

    it('surfaces a failed last attempt (connected does not imply working)', async () => {
        mockAuthGet.mockResolvedValue(
            makeResponse({
                data: {
                    enabled: true,
                    lastSyncAt: '2026-09-20T10:00:00.000Z',
                    lastSyncOk: false,
                    lastSyncError: 'authentication (401)',
                },
            })
        )

        const {result} = renderHook(() => useJiraStatus(), {wrapper})

        await waitFor(() => expect(result.current.status.lastSyncOk).toBe(false))
        expect(result.current.status.lastSyncError).toBe('authentication (401)')
    })

    it('posts to /jira/refresh and, on success, refetches status + invalidates ticket-info (not a hand-built optimistic object)', async () => {
        const initialStatus = {
            enabled: true,
            lastSyncAt: null,
            lastSyncOk: null,
            lastSyncError: null,
        }
        const updatedStatus = {
            enabled: true,
            lastSyncAt: '2026-09-24T11:00:00.000Z',
            lastSyncOk: true,
            lastSyncError: null,
        }
        mockAuthGet
            .mockResolvedValueOnce(makeResponse({data: initialStatus}))
            .mockResolvedValue(makeResponse({data: updatedStatus}))
        mockAuthPost.mockResolvedValue(
            makeResponse({
                data: {checked: 3, updated: 3, failed: 0, lastSyncAt: '2026-09-24T11:00:00.000Z'},
            })
        )
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        const {result} = renderHook(() => useJiraStatus(), {wrapper})
        await waitFor(() => expect(result.current.isLoading).toBe(false))

        act(() => result.current.refresh())

        await waitFor(() => expect(result.current.refreshResult).toBeTruthy())
        expect(mockAuthPost).toHaveBeenCalledWith('http://localhost:3000/api/jira/refresh')
        await waitFor(() => expect(result.current.status).toEqual(updatedStatus))
        expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['jira-status']})
        expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['jira-ticket-info']})
    })

    it('surfaces a refresh error without throwing', async () => {
        mockAuthGet.mockResolvedValue(
            makeResponse({
                data: {enabled: true, lastSyncAt: null, lastSyncOk: null, lastSyncError: null},
            })
        )
        mockAuthPost.mockResolvedValue(makeResponse({message: 'Jira API responded 401'}, false))

        const {result} = renderHook(() => useJiraStatus(), {wrapper})
        await waitFor(() => expect(result.current.isLoading).toBe(false))

        act(() => result.current.refresh())

        await waitFor(() => expect(result.current.refreshError).toBeTruthy())
        expect((result.current.refreshError as Error).message).toBe('Jira API responded 401')
    })
})

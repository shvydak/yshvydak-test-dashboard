import {describe, it, expect, vi, beforeEach} from 'vitest'
import {renderHook, waitFor} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {createElement} from 'react'
import {useJiraTicketInfo, JiraTicketInfo} from '../useJiraTicketInfo'

vi.mock('@features/authentication/utils/authFetch', () => ({
    authGet: vi.fn(),
}))

vi.mock('@config/environment.config', () => ({
    config: {
        api: {
            baseUrl: 'http://localhost:3000/api',
        },
    },
}))

import {authGet} from '@features/authentication/utils/authFetch'

const mockAuthGet = authGet as ReturnType<typeof vi.fn>

function makeResponse(body: unknown, ok = true) {
    return {
        ok,
        json: () => Promise.resolve(body),
    } as unknown as Response
}

function wrapper({children}: {children: React.ReactNode}) {
    const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}})
    return createElement(QueryClientProvider, {client: queryClient}, children)
}

const ticket = (overrides: Partial<JiraTicketInfo> = {}): JiraTicketInfo => ({
    key: 'PB-1',
    issueType: 'Bug',
    statusName: 'To Do',
    statusCategory: 'new',
    summary: 'x',
    assignee: null,
    fetchedAt: '2026-09-24T10:00:00.000Z',
    ...overrides,
})

describe('useJiraTicketInfo', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('does not fetch, and returns an empty map, for an empty key list', () => {
        const {result} = renderHook(() => useJiraTicketInfo([]), {wrapper})

        expect(mockAuthGet).not.toHaveBeenCalled()
        expect(result.current.ticketInfo.size).toBe(0)
    })

    it('fetches a comma-joined, sorted, de-duplicated key list', async () => {
        mockAuthGet.mockResolvedValue(makeResponse({data: []}))

        renderHook(() => useJiraTicketInfo(['PB-2', 'PB-1', 'PB-1']), {wrapper})

        await waitFor(() => expect(mockAuthGet).toHaveBeenCalledTimes(1))
        expect(mockAuthGet).toHaveBeenCalledWith(
            'http://localhost:3000/api/jira/tickets?keys=PB-1%2CPB-2'
        )
    })

    it('returns a map keyed by ticket key', async () => {
        mockAuthGet.mockResolvedValue(
            makeResponse({
                data: [ticket({key: 'PB-1'}), ticket({key: 'PB-2', statusCategory: 'done'})],
            })
        )

        const {result} = renderHook(() => useJiraTicketInfo(['PB-1', 'PB-2']), {wrapper})

        await waitFor(() => expect(result.current.ticketInfo.size).toBe(2))
        expect(result.current.ticketInfo.get('PB-1')).toMatchObject({statusCategory: 'new'})
        expect(result.current.ticketInfo.get('PB-2')).toMatchObject({statusCategory: 'done'})
        expect(result.current.ticketInfo.get('PB-999')).toBeUndefined()
    })

    it('starts with an empty map while the request is in flight', () => {
        mockAuthGet.mockReturnValue(new Promise(() => {})) // never resolves

        const {result} = renderHook(() => useJiraTicketInfo(['PB-1']), {wrapper})

        expect(result.current.ticketInfo.size).toBe(0)
        expect(result.current.isLoading).toBe(true)
    })

    it('degrades to an empty map (not a throw) when the request fails', async () => {
        mockAuthGet.mockResolvedValue(makeResponse({}, false))

        const {result} = renderHook(() => useJiraTicketInfo(['PB-1']), {wrapper})

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(result.current.ticketInfo.size).toBe(0)
    })

    describe('more than 200 keys (server caps a single request at 200)', () => {
        const keysOf = (count: number) =>
            Array.from({length: count}, (_, i) => `PB-${String(i).padStart(4, '0')}`)

        function keysFromUrl(url: string): string[] {
            return new URLSearchParams(url.split('?')[1]).get('keys')!.split(',')
        }

        it('splits into batches of at most 200 and merges every batch into one map', async () => {
            mockAuthGet.mockImplementation((url: string) =>
                Promise.resolve(makeResponse({data: keysFromUrl(url).map((key) => ticket({key}))}))
            )

            const {result} = renderHook(() => useJiraTicketInfo(keysOf(250)), {wrapper})

            await waitFor(() => expect(result.current.ticketInfo.size).toBe(250))
            expect(mockAuthGet).toHaveBeenCalledTimes(2)
            const batchSizes = mockAuthGet.mock.calls
                .map((call) => keysFromUrl(call[0] as string).length)
                .sort((a: number, b: number) => a - b)
            expect(batchSizes).toEqual([50, 200])
        })

        it('fires every batch up front, without waiting for an earlier one to resolve', async () => {
            let resolveFirst!: (v: Response) => void
            let resolveSecond!: (v: Response) => void
            mockAuthGet
                .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
                .mockReturnValueOnce(new Promise((resolve) => (resolveSecond = resolve)))

            renderHook(() => useJiraTicketInfo(keysOf(250)), {wrapper})

            // Both requests must already be in flight — proves parallel dispatch, not
            // batch-after-batch (which would only have fired one call by now).
            await waitFor(() => expect(mockAuthGet).toHaveBeenCalledTimes(2))

            resolveFirst(makeResponse({data: []}))
            resolveSecond(makeResponse({data: []}))
        })

        it('merges the successful batches even when another batch fails (a bad batch must not wipe out data from healthy ones)', async () => {
            mockAuthGet.mockImplementation((url: string) => {
                const requested = keysFromUrl(url)
                if (requested.length === 200) {
                    return Promise.resolve(makeResponse({}, false)) // this batch fails
                }
                return Promise.resolve(makeResponse({data: requested.map((key) => ticket({key}))}))
            })

            const {result} = renderHook(() => useJiraTicketInfo(keysOf(250)), {wrapper})

            await waitFor(() => expect(result.current.isLoading).toBe(false))
            expect(result.current.ticketInfo.size).toBe(50)
        })
    })
})

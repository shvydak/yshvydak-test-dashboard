import {describe, it, expect, vi, beforeEach} from 'vitest'
import {renderHook, act, waitFor} from '@testing-library/react'
import {useTestExecutionHistory} from '../useTestExecutionHistory'

vi.mock('@features/authentication/utils/authFetch', () => ({authGet: vi.fn()}))
vi.mock('@config/environment.config', () => ({config: {api: {serverUrl: 'http://s'}}}))

import {authGet} from '@features/authentication/utils/authFetch'

const mockAuthGet = authGet as ReturnType<typeof vi.fn>

const rows = (n: number, prefix = 'e', offset = 0) =>
    Array.from({length: n}, (_, i) => ({
        id: `${prefix}${i + offset}`,
        createdAt: new Date(Date.UTC(2026, 0, 1) + (1000 - i - offset) * 60000).toISOString(),
    }))

const respond = (data: unknown[], count: number) =>
    ({ok: true, json: () => Promise.resolve({data, count})}) as unknown as Response

describe('useTestExecutionHistory — refetch', () => {
    beforeEach(() => vi.clearAllMocks())

    it('refetch of the same test runs in the background: list stays, no loading state', async () => {
        mockAuthGet.mockResolvedValue(respond(rows(3), 3))
        const {result} = renderHook(() => useTestExecutionHistory('t1'))
        await waitFor(() => expect(result.current.executions).toHaveLength(3))

        let resolveNext: (r: Response) => void = () => {}
        mockAuthGet.mockReturnValueOnce(new Promise<Response>((r) => (resolveNext = r)))
        act(() => result.current.refetch())

        // While the request is in flight the old rows are still shown and nothing "loads"
        expect(result.current.loading).toBe(false)
        expect(result.current.executions).toHaveLength(3)

        await act(async () => resolveNext(respond(rows(4), 4)))
        await waitFor(() => expect(result.current.executions).toHaveLength(4))
        expect(result.current.loading).toBe(false)
    })

    it('a refetch asks for as many rows as are loaded, so "load more" pages survive', async () => {
        mockAuthGet.mockResolvedValueOnce(respond(rows(50), 120))
        const {result} = renderHook(() => useTestExecutionHistory('t1'))
        await waitFor(() => expect(result.current.executions).toHaveLength(50))
        expect(mockAuthGet.mock.calls[0][0]).toContain('limit=50')

        mockAuthGet.mockResolvedValueOnce(respond(rows(50, 'e', 50), 120))
        act(() => result.current.loadMore())
        await waitFor(() => expect(result.current.executions).toHaveLength(100))

        mockAuthGet.mockResolvedValueOnce(respond(rows(100), 121))
        act(() => result.current.refetch())
        await waitFor(() => expect(mockAuthGet).toHaveBeenCalledTimes(3))
        expect(mockAuthGet.mock.calls[2][0]).toContain('limit=100')
        await waitFor(() => expect(result.current.executions).toHaveLength(100))
    })

    it('a late response for the previous test does not land on the new one', async () => {
        let resolveT1: (r: Response) => void = () => {}
        mockAuthGet.mockReturnValueOnce(new Promise<Response>((r) => (resolveT1 = r)))
        const {result, rerender} = renderHook(({id}) => useTestExecutionHistory(id), {
            initialProps: {id: 't1'},
        })

        mockAuthGet.mockResolvedValueOnce(respond(rows(2, 't2-'), 2))
        rerender({id: 't2'})
        await waitFor(() => expect(result.current.executions).toHaveLength(2))

        await act(async () => resolveT1(respond(rows(5, 't1-'), 5)))

        expect(result.current.executions.map((e) => e.id)).toEqual(['t2-0', 't2-1'])
        expect(result.current.total).toBe(2)
        expect(result.current.loading).toBe(false)
    })

    it('a different test still shows the loading state', async () => {
        mockAuthGet.mockResolvedValue(respond(rows(2), 2))
        const {result, rerender} = renderHook(({id}) => useTestExecutionHistory(id), {
            initialProps: {id: 't1'},
        })
        await waitFor(() => expect(result.current.executions).toHaveLength(2))

        mockAuthGet.mockReturnValueOnce(new Promise(() => {}))
        rerender({id: 't2'})

        await waitFor(() => expect(result.current.loading).toBe(true))
    })

    it('a "load more" started for the previous test is not appended to the new one', async () => {
        mockAuthGet.mockResolvedValueOnce(respond(rows(50, 't1-'), 120))
        const {result, rerender} = renderHook(({id}) => useTestExecutionHistory(id), {
            initialProps: {id: 't1'},
        })
        await waitFor(() => expect(result.current.executions).toHaveLength(50))

        let resolveMore: (r: Response) => void = () => {}
        mockAuthGet.mockReturnValueOnce(new Promise<Response>((r) => (resolveMore = r)))
        act(() => result.current.loadMore())

        mockAuthGet.mockResolvedValueOnce(respond(rows(2, 't2-'), 2))
        rerender({id: 't2'})
        await waitFor(() =>
            expect(result.current.executions.map((e) => e.id)).toEqual(['t2-0', 't2-1'])
        )

        await act(async () => resolveMore(respond(rows(50, 't1-old-'), 120)))

        expect(result.current.executions.map((e) => e.id)).toEqual(['t2-0', 't2-1'])
        expect(result.current.total).toBe(2)
        expect(result.current.loadingMore).toBe(false)
    })

    it("a stale load-more settling does not end the new test's own load-more spinner", async () => {
        mockAuthGet.mockResolvedValueOnce(respond(rows(50, 't1-'), 120))
        const {result, rerender} = renderHook(({id}) => useTestExecutionHistory(id), {
            initialProps: {id: 't1'},
        })
        await waitFor(() => expect(result.current.executions).toHaveLength(50))

        let resolveOld: (r: Response) => void = () => {}
        mockAuthGet.mockReturnValueOnce(new Promise<Response>((r) => (resolveOld = r)))
        act(() => result.current.loadMore())

        mockAuthGet.mockResolvedValueOnce(respond(rows(50, 't2-'), 120))
        rerender({id: 't2'})
        await waitFor(() => expect(result.current.executions).toHaveLength(50))

        mockAuthGet.mockReturnValueOnce(new Promise(() => {})) // t2's own load-more stays pending
        act(() => result.current.loadMore())
        await waitFor(() => expect(result.current.loadingMore).toBe(true))

        await act(async () => resolveOld(respond(rows(50, 't1-old-'), 120)))

        expect(result.current.loadingMore).toBe(true)
    })
})

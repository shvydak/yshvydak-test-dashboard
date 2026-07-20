import {describe, it, expect, vi, beforeEach} from 'vitest'
import {renderHook, waitFor} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {createElement} from 'react'
import {useTestStatusCounts} from '../useTestStatusCounts'

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
    const queryClient = new QueryClient({
        defaultOptions: {queries: {retry: false}},
    })
    return createElement(QueryClientProvider, {client: queryClient}, children)
}

describe('useTestStatusCounts', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns the fetched counts, unlimited by any list page size', async () => {
        const counts = {total: 850, passed: 800, failed: 30, skipped: 15, pending: 5, noted: 12}
        mockAuthGet.mockResolvedValue(makeResponse({data: counts}))

        const {result} = renderHook(() => useTestStatusCounts(), {wrapper})

        await waitFor(() => expect(result.current.counts).toEqual(counts))
        expect(mockAuthGet).toHaveBeenCalledWith('http://localhost:3000/api/tests/status-counts?')
    })

    it('scopes the request with ?project= when a project is given', async () => {
        const counts = {total: 10, passed: 8, failed: 2, skipped: 0, pending: 0, noted: 0}
        mockAuthGet.mockResolvedValue(makeResponse({data: counts}))

        const {result} = renderHook(() => useTestStatusCounts('API_Tests'), {wrapper})

        await waitFor(() => expect(result.current.counts).toEqual(counts))
        expect(mockAuthGet).toHaveBeenCalledWith(
            'http://localhost:3000/api/tests/status-counts?project=API_Tests'
        )
    })

    it('returns all-zero counts while loading / before data arrives', () => {
        mockAuthGet.mockReturnValue(new Promise(() => {})) // never resolves
        const {result} = renderHook(() => useTestStatusCounts(), {wrapper})
        expect(result.current.counts).toEqual({
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            pending: 0,
            noted: 0,
        })
    })

    it('does not fetch when not authenticated', () => {
        renderHook(() => useTestStatusCounts(undefined, false), {wrapper})
        expect(mockAuthGet).not.toHaveBeenCalled()
    })
})

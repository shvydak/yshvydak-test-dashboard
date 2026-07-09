import {describe, it, expect, vi, beforeEach} from 'vitest'
import {renderHook, waitFor} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {createElement} from 'react'
import {useProjectStatusSummary} from '../useProjectStatusSummary'

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

describe('useProjectStatusSummary', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns the fetched summary', async () => {
        const summary = [
            {project: 'API_Tests', total: 62, passed: 62, failed: 0},
            {project: 'All_Tests', total: 8, passed: 5, failed: 3},
        ]
        mockAuthGet.mockResolvedValue(makeResponse({data: summary}))

        const {result} = renderHook(() => useProjectStatusSummary(), {wrapper})

        await waitFor(() => expect(result.current.summary).toEqual(summary))
        expect(mockAuthGet).toHaveBeenCalledWith(
            'http://localhost:3000/api/tests/summary-by-project'
        )
    })

    it('returns an empty array while loading / before data arrives', () => {
        mockAuthGet.mockReturnValue(new Promise(() => {})) // never resolves
        const {result} = renderHook(() => useProjectStatusSummary(), {wrapper})
        expect(result.current.summary).toEqual([])
    })

    it('does not fetch when not authenticated', () => {
        renderHook(() => useProjectStatusSummary(false), {wrapper})
        expect(mockAuthGet).not.toHaveBeenCalled()
    })
})

import {describe, it, expect, vi, beforeEach} from 'vitest'
import {renderHook, waitFor} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {createElement} from 'react'
import {TestResult} from '@yshvydak/core'
import {useFilteredTestsByStatus} from '../useFilteredTestsByStatus'

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

const sampleTests: TestResult[] = [
    {
        id: 'exec-1',
        testId: 'test-1',
        name: 'A failing test',
        filePath: '/a.spec.ts',
        status: 'failed',
        duration: 100,
        createdAt: '2025-01-01T00:00:00Z',
        runId: 'run-1',
    },
]

describe('useFilteredTestsByStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('sends status and a high limit for a real status filter', async () => {
        mockAuthGet.mockResolvedValue(makeResponse({data: sampleTests}))

        const {result} = renderHook(() => useFilteredTestsByStatus('failed'), {wrapper})

        await waitFor(() => expect(result.current.tests).toEqual(sampleTests))
        expect(mockAuthGet).toHaveBeenCalledWith(
            'http://localhost:3000/api/tests?limit=5000&status=failed'
        )
    })

    it('scopes the request with project when given', async () => {
        mockAuthGet.mockResolvedValue(makeResponse({data: sampleTests}))

        renderHook(() => useFilteredTestsByStatus('failed', 'API_Tests'), {wrapper})

        await waitFor(() =>
            expect(mockAuthGet).toHaveBeenCalledWith(
                'http://localhost:3000/api/tests?limit=5000&project=API_Tests&status=failed'
            )
        )
    })

    it('omits status for the "noted" filter (not a DB status column)', async () => {
        mockAuthGet.mockResolvedValue(makeResponse({data: sampleTests}))

        renderHook(() => useFilteredTestsByStatus('noted'), {wrapper})

        await waitFor(() =>
            expect(mockAuthGet).toHaveBeenCalledWith('http://localhost:3000/api/tests?limit=5000')
        )
    })

    it('does not fetch for filter "all"', () => {
        renderHook(() => useFilteredTestsByStatus('all'), {wrapper})
        expect(mockAuthGet).not.toHaveBeenCalled()
    })

    it('does not fetch when not authenticated', () => {
        renderHook(() => useFilteredTestsByStatus('failed', undefined, false), {wrapper})
        expect(mockAuthGet).not.toHaveBeenCalled()
    })

    it('returns an empty list while loading / before data arrives', () => {
        mockAuthGet.mockReturnValue(new Promise(() => {})) // never resolves
        const {result} = renderHook(() => useFilteredTestsByStatus('failed'), {wrapper})
        expect(result.current.tests).toEqual([])
        expect(result.current.isLoading).toBe(true)
    })
})

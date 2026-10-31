import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {renderHook, act} from '@testing-library/react'
import {useTestSearch, SEARCH_DEBOUNCE_MS} from '../useTestSearch'
import type {TestSearchHit} from '@/services/testSearch.service'

const mockSearch = vi.fn()
vi.mock('@/services/testSearch.service', () => ({
    testSearchService: {search: (q: string) => mockSearch(q)},
}))

const hit = (testId: string): TestSearchHit => ({
    testId,
    name: testId,
    filePath: 'a.spec.ts',
    project: 'web',
    status: 'passed',
    tickets: [],
    createdAt: '',
    updatedAt: '',
})

const deferred = <T>() => {
    let resolve!: (v: T) => void
    const promise = new Promise<T>((r) => (resolve = r))
    return {promise, resolve}
}

describe('useTestSearch', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        mockSearch.mockReset()
    })
    afterEach(() => vi.useRealTimers())

    it('requests nothing below 2 characters', async () => {
        const {result} = renderHook(() => useTestSearch(' a '))
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000)
        })
        expect(mockSearch).not.toHaveBeenCalled()
        expect(result.current.enabled).toBe(false)
        expect(result.current.isLoading).toBe(false)
    })

    it('debounces typing into one request, loading until it answers', async () => {
        mockSearch.mockResolvedValue([hit('t1')])
        const {result, rerender} = renderHook(({q}) => useTestSearch(q), {
            initialProps: {q: 'or'},
        })
        expect(result.current.isLoading).toBe(true)
        await act(async () => {
            await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 50)
        })
        rerender({q: 'ord'})
        await act(async () => {
            await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 50)
        })
        expect(mockSearch).not.toHaveBeenCalled()
        await act(async () => {
            await vi.advanceTimersByTimeAsync(100)
        })
        expect(mockSearch).toHaveBeenCalledTimes(1)
        expect(mockSearch).toHaveBeenCalledWith('ord')
        expect(result.current.isLoading).toBe(false)
        expect(result.current.results.map((t) => t.testId)).toEqual(['t1'])
    })

    it('ignores an older query answering after a newer one', async () => {
        const first = deferred<TestSearchHit[]>()
        mockSearch.mockImplementationOnce(() => first.promise)
        mockSearch.mockImplementationOnce(async () => [hit('new')])
        const {result, rerender} = renderHook(({q}) => useTestSearch(q), {
            initialProps: {q: 'old'},
        })
        await act(async () => {
            await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)
        })
        rerender({q: 'newer'})
        await act(async () => {
            await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)
        })
        expect(result.current.results.map((t) => t.testId)).toEqual(['new'])
        await act(async () => {
            first.resolve([hit('stale')])
        })
        expect(result.current.results.map((t) => t.testId)).toEqual(['new'])
    })

    it('reports an error', async () => {
        mockSearch.mockRejectedValue(new Error('boom'))
        const {result} = renderHook(() => useTestSearch('abc'))
        await act(async () => {
            await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)
        })
        expect(result.current.error).toBe(true)
        expect(result.current.isLoading).toBe(false)
        expect(result.current.results).toEqual([])
    })
})

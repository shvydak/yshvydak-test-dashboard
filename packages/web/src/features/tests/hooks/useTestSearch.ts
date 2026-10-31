import {useEffect, useRef, useState} from 'react'
import {testSearchService, type TestSearchHit} from '@/services/testSearch.service'

export const SEARCH_MIN_CHARS = 2
export const SEARCH_DEBOUNCE_MS = 150

interface SearchState {
    // The trimmed query these results/error belong to
    query: string
    results: TestSearchHit[]
    error: boolean
}

/**
 * Debounced palette search. Below the minimum length nothing is requested. An answer for an older
 * query never replaces a newer one (request counter), and `isLoading` covers the debounce wait.
 */
export function useTestSearch(rawQuery: string) {
    const query = rawQuery.trim()
    const enabled = query.length >= SEARCH_MIN_CHARS
    const [state, setState] = useState<SearchState | null>(null)
    const requestRef = useRef(0)

    useEffect(() => {
        const request = ++requestRef.current
        if (!enabled) return
        const timer = setTimeout(() => {
            testSearchService
                .search(query)
                .then((results) => {
                    if (request === requestRef.current) setState({query, results, error: false})
                })
                .catch(() => {
                    if (request === requestRef.current) setState({query, results: [], error: true})
                })
        }, SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [query, enabled])

    const settled = enabled && state?.query === query
    return {
        enabled,
        isLoading: enabled && !settled,
        error: settled && state!.error,
        // Previous results stay visible while a newer query is loading, so the list does not flash
        results: enabled ? (state?.results ?? []) : [],
    }
}

import {useState, useEffect, useCallback, useRef} from 'react'
import {TestResult} from '@yshvydak/core'
import {authGet} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'

// Page size for the execution-history sidebar. Loading a small first page keeps
// the modal snappy; older pages are fetched on demand via keyset pagination.
const PAGE_SIZE = 50

export interface UseTestExecutionHistoryReturn {
    executions: TestResult[]
    total: number
    hasMore: boolean
    loading: boolean
    loadingMore: boolean
    error: string | null
    loadMore: () => void
    refetch: () => void
}

export function useTestExecutionHistory(testId: string): UseTestExecutionHistoryReturn {
    const [executions, setExecutions] = useState<TestResult[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [refreshTrigger, setRefreshTrigger] = useState(0)
    // Which test the list on screen belongs to, and how many rows are loaded: a refetch of the
    // same test runs in the background (no skeleton) and keeps the loaded pages.
    const loadedTestIdRef = useRef<string | null>(null)
    const loadedCountRef = useRef(0)
    // Bumped when the test changes: a loadMore started for the old test must not append to the new one
    const testGenerationRef = useRef(0)

    const refetch = useCallback(() => {
        setRefreshTrigger((prev) => prev + 1)
    }, [])

    useEffect(() => {
        testGenerationRef.current++
        setLoadingMore(false)
    }, [testId])

    useEffect(() => {
        loadedCountRef.current = executions.length
    }, [executions.length])

    // First page (or reload). Replaces the list and resets the total.
    useEffect(() => {
        if (!testId) {
            setExecutions([])
            setTotal(0)
            loadedTestIdRef.current = null
            loadedCountRef.current = 0
            return
        }

        const background = loadedTestIdRef.current === testId
        // A late response for a previous test (or an older refetch) must not land on this one
        let cancelled = false

        const fetchHistory = async () => {
            if (!background) setLoading(true)
            setError(null)
            try {
                // byTestId=true tells the server we already have the stable test_id
                // (not an execution id), so it can skip an extra SELECT + attachment
                // lookup that exists for backwards-compatible execution-id callers.
                const response = await authGet(
                    `${config.api.serverUrl}/api/tests/${testId}/history?limit=${background ? Math.max(PAGE_SIZE, loadedCountRef.current) : PAGE_SIZE}&byTestId=true`
                )

                if (cancelled) return
                if (response.ok) {
                    const data = await response.json()
                    if (cancelled) return
                    loadedTestIdRef.current = testId
                    setExecutions(data.data || [])
                    // `count` is the TOTAL execution count, not the page length.
                    setTotal(typeof data.count === 'number' ? data.count : (data.data || []).length)
                } else {
                    setError('Failed to load execution history')
                }
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error')
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        fetchHistory()
        return () => {
            cancelled = true
        }
    }, [testId, refreshTrigger])

    // Fetch the next page of older executions using a keyset cursor (created_at of
    // the last loaded row), which stays O(PAGE_SIZE) regardless of history depth.
    const loadMore = useCallback(() => {
        if (!testId || loadingMore || loading) return
        if (executions.length >= total) return

        const last = executions[executions.length - 1]
        const cursor = last?.createdAt || last?.timestamp
        if (!cursor) return

        const generation = testGenerationRef.current
        const isCurrent = () => generation === testGenerationRef.current
        const fetchMore = async () => {
            setLoadingMore(true)
            try {
                const response = await authGet(
                    `${config.api.serverUrl}/api/tests/${testId}/history?limit=${PAGE_SIZE}&byTestId=true&before=${encodeURIComponent(cursor)}`
                )

                if (!isCurrent()) return
                if (response.ok) {
                    const data = await response.json()
                    if (!isCurrent()) return
                    const next: TestResult[] = data.data || []
                    // Guard against duplicate ids if executions arrive concurrently.
                    setExecutions((prev) => {
                        const seen = new Set(prev.map((e) => e.id))
                        return [...prev, ...next.filter((e) => !seen.has(e.id))]
                    })
                    if (typeof data.count === 'number') setTotal(data.count)
                } else {
                    setError('Failed to load more history')
                }
            } catch (err) {
                if (isCurrent()) setError(err instanceof Error ? err.message : 'Unknown error')
            } finally {
                if (isCurrent()) setLoadingMore(false)
            }
        }

        fetchMore()
    }, [testId, executions, total, loadingMore, loading])

    return {
        executions,
        total,
        hasMore: executions.length < total,
        loading,
        loadingMore,
        error,
        loadMore,
        refetch,
    }
}

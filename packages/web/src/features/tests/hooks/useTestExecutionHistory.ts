import {useState, useEffect, useCallback} from 'react'
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

    const refetch = useCallback(() => {
        setRefreshTrigger((prev) => prev + 1)
    }, [])

    // First page (or reload). Replaces the list and resets the total.
    useEffect(() => {
        if (!testId) {
            setExecutions([])
            setTotal(0)
            return
        }

        const fetchHistory = async () => {
            setLoading(true)
            setError(null)
            try {
                // byTestId=true tells the server we already have the stable test_id
                // (not an execution id), so it can skip an extra SELECT + attachment
                // lookup that exists for backwards-compatible execution-id callers.
                const response = await authGet(
                    `${config.api.serverUrl}/api/tests/${testId}/history?limit=${PAGE_SIZE}&byTestId=true`
                )

                if (response.ok) {
                    const data = await response.json()
                    setExecutions(data.data || [])
                    // `count` is the TOTAL execution count, not the page length.
                    setTotal(typeof data.count === 'number' ? data.count : (data.data || []).length)
                } else {
                    setError('Failed to load execution history')
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error')
            } finally {
                setLoading(false)
            }
        }

        fetchHistory()
    }, [testId, refreshTrigger])

    // Fetch the next page of older executions using a keyset cursor (created_at of
    // the last loaded row), which stays O(PAGE_SIZE) regardless of history depth.
    const loadMore = useCallback(() => {
        if (!testId || loadingMore || loading) return
        if (executions.length >= total) return

        const last = executions[executions.length - 1]
        const cursor = last?.createdAt || last?.timestamp
        if (!cursor) return

        const fetchMore = async () => {
            setLoadingMore(true)
            try {
                const response = await authGet(
                    `${config.api.serverUrl}/api/tests/${testId}/history?limit=${PAGE_SIZE}&byTestId=true&before=${encodeURIComponent(cursor)}`
                )

                if (response.ok) {
                    const data = await response.json()
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
                setError(err instanceof Error ? err.message : 'Unknown error')
            } finally {
                setLoadingMore(false)
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

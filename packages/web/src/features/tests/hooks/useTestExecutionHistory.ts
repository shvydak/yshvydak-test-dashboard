import {useState, useEffect, useCallback} from 'react'
import {TestResult} from '@yshvydak/core'
import {authGet} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'

export interface UseTestExecutionHistoryReturn {
    executions: TestResult[]
    loading: boolean
    error: string | null
    refetch: () => void
}

export function useTestExecutionHistory(testId: string): UseTestExecutionHistoryReturn {
    const [executions, setExecutions] = useState<TestResult[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [refreshTrigger, setRefreshTrigger] = useState(0)

    const refetch = useCallback(() => {
        setRefreshTrigger((prev) => prev + 1)
    }, [])

    useEffect(() => {
        if (!testId) {
            setExecutions([])
            return
        }

        const fetchHistory = async () => {
            setLoading(true)
            setError(null)
            try {
                const response = await authGet(
                    `${config.api.serverUrl}/api/tests/${testId}/history?limit=200`
                )

                if (response.ok) {
                    const data = await response.json()
                    setExecutions(data.data || [])
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

    return {executions, loading, error, refetch}
}

import {useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {authFetch} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'
import {useTestsStore} from '@features/tests/store/testsStore'

export interface UseDashboardActionsReturn {
    clearingData: boolean
    cleaningData: boolean
    clearAllData: () => Promise<void>
    cleanupData: (type: 'date' | 'count', value: string | number) => Promise<void>
}

export function useDashboardActions(): UseDashboardActionsReturn {
    const queryClient = useQueryClient()
    const {fetchTests} = useTestsStore()
    const [clearingData, setClearingData] = useState(false)
    const [cleaningData, setCleaningData] = useState(false)

    const clearAllData = async () => {
        if (
            !confirm(
                '⚠️ Are you sure you want to clear ALL test data? This action cannot be undone.'
            )
        ) {
            return
        }

        setClearingData(true)
        try {
            const response = await authFetch(`${config.api.baseUrl}/tests/all`, {
                method: 'DELETE',
            })

            if (!response.ok) {
                throw new Error('Failed to clear data')
            }

            const result = await response.json()
            const statsBefore = result.data?.statsBefore || {}
            const totalRuns = statsBefore.totalRuns || 0
            const totalResults = statsBefore.totalTests || 0
            const totalAttachments = statsBefore.totalAttachments || 0

            alert(
                `✅ Success! Cleared ${totalRuns} runs, ${totalResults} results, ${totalAttachments} attachments`
            )

            fetchTests()

            // Invalidate storage stats cache to reflect cleared storage
            queryClient.invalidateQueries({queryKey: ['storage-stats']})
        } catch (error) {
            alert(
                '❌ Failed to clear data: ' +
                    (error instanceof Error ? error.message : 'Unknown error')
            )
        } finally {
            setClearingData(false)
        }
    }

    const cleanupData = async (type: 'date' | 'count', value: string | number) => {
        setCleaningData(true)
        try {
            const response = await authFetch(`${config.api.baseUrl}/tests/cleanup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({type, value}),
            })

            if (!response.ok) {
                throw new Error('Failed to cleanup data')
            }

            const result = await response.json()
            const {deletedExecutions, freedSpace} = result.data

            const freedMb = (freedSpace / (1024 * 1024)).toFixed(2)
            alert(
                `✅ Cleanup complete! Deleted ${deletedExecutions} executions and freed ${freedMb} MB.`
            )

            fetchTests()
            queryClient.invalidateQueries({queryKey: ['storage-stats']})
        } catch (error) {
            alert(
                '❌ Failed to cleanup data: ' +
                    (error instanceof Error ? error.message : 'Unknown error')
            )
        } finally {
            setCleaningData(false)
        }
    }

    return {
        clearingData,
        cleaningData,
        clearAllData,
        cleanupData,
    }
}

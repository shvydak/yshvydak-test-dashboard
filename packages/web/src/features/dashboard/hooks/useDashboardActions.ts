import {useState} from 'react'
import {authFetch} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'
import {useTestsStore} from '@features/tests/store/testsStore'

export interface UseDashboardActionsReturn {
    clearingData: boolean
    clearAllData: () => Promise<void>
}

export function useDashboardActions(): UseDashboardActionsReturn {
    const {fetchTests} = useTestsStore()
    const [clearingData, setClearingData] = useState(false)

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
            const statsBefore = result.statsBefore || {}
            const totalRuns = statsBefore.total_runs || 0
            const totalResults = statsBefore.total_results || 0
            const totalAttachments = statsBefore.total_attachments || 0

            alert(
                `✅ Success! Cleared ${totalRuns} runs, ${totalResults} results, ${totalAttachments} attachments`
            )

            fetchTests()
        } catch (error) {
            alert(
                '❌ Failed to clear data: ' +
                    (error instanceof Error ? error.message : 'Unknown error')
            )
        } finally {
            setClearingData(false)
        }
    }

    return {
        clearingData,
        clearAllData,
    }
}

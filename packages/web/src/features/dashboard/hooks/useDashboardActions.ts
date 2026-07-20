import {useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {authFetch} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'
import {useTestsStore} from '@features/tests/store/testsStore'

export interface UseDashboardActionsReturn {
    clearingData: boolean
    cleaningData: boolean
    clearAllData: (project?: string) => Promise<void>
    cleanupData: (
        type: 'date' | 'count',
        value: string | number,
        mode?: 'strip' | 'full'
    ) => Promise<void>
}

export function useDashboardActions(): UseDashboardActionsReturn {
    const queryClient = useQueryClient()
    const {fetchTests} = useTestsStore()
    const [clearingData, setClearingData] = useState(false)
    const [cleaningData, setCleaningData] = useState(false)

    const clearAllData = async (project?: string) => {
        const confirmMessage = project
            ? `⚠️ Are you sure you want to clear ALL test data for project "${project}"? This action cannot be undone.`
            : '⚠️ Are you sure you want to clear ALL test data? This action cannot be undone.'

        if (!confirm(confirmMessage)) {
            return
        }

        setClearingData(true)
        try {
            const url = project
                ? `${config.api.baseUrl}/tests/all?project=${encodeURIComponent(project)}`
                : `${config.api.baseUrl}/tests/all`
            const response = await authFetch(url, {
                method: 'DELETE',
            })

            if (!response.ok) {
                throw new Error('Failed to clear data')
            }

            const result = await response.json()

            if (project) {
                const deletedExecutions = result.data?.deletedExecutions || 0
                alert(
                    `✅ Success! Cleared ${deletedExecutions} executions for project "${project}"`
                )
            } else {
                const statsBefore = result.data?.statsBefore || {}
                const totalRuns = statsBefore.totalRuns || 0
                const totalResults = statsBefore.totalTests || 0
                const totalAttachments = statsBefore.totalAttachments || 0

                alert(
                    `✅ Success! Cleared ${totalRuns} runs, ${totalResults} results, ${totalAttachments} attachments`
                )
            }

            fetchTests()

            // Invalidate storage stats + status-count caches to reflect cleared
            // storage and filter-bar/tab badges
            queryClient.invalidateQueries({queryKey: ['storage-stats']})
            queryClient.invalidateQueries({queryKey: ['project-status-summary']})
            queryClient.invalidateQueries({queryKey: ['test-status-counts']})
        } catch (error) {
            alert(
                '❌ Failed to clear data: ' +
                    (error instanceof Error ? error.message : 'Unknown error')
            )
        } finally {
            setClearingData(false)
        }
    }

    const cleanupData = async (
        type: 'date' | 'count',
        value: string | number,
        mode: 'strip' | 'full' = 'strip'
    ) => {
        setCleaningData(true)
        try {
            const response = await authFetch(`${config.api.baseUrl}/tests/cleanup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({type, value, mode}),
            })

            if (!response.ok) {
                throw new Error('Failed to cleanup data')
            }

            const result = await response.json()
            const {deletedExecutions, freedSpace, mode: resultMode} = result.data

            const freedMb = (freedSpace / (1024 * 1024)).toFixed(2)
            alert(
                resultMode === 'strip'
                    ? `✅ Freed ${freedMb} MB from ${deletedExecutions} executions. Test history kept.`
                    : `✅ Cleanup complete! Deleted ${deletedExecutions} executions and freed ${freedMb} MB.`
            )

            fetchTests()
            queryClient.invalidateQueries({queryKey: ['storage-stats']})
            // 'full' mode deletes rows outright, which can change which row is
            // "latest" per test_id — refresh badges just in case ('strip' mode only
            // removes attachments, so this is a no-op for counts but harmless).
            queryClient.invalidateQueries({queryKey: ['project-status-summary']})
            queryClient.invalidateQueries({queryKey: ['test-status-counts']})
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

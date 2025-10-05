import {useTestExecutionHistory} from '../../hooks/useTestExecutionHistory'
import {ExecutionList} from './ExecutionList'

export interface TestHistoryTabProps {
    testId: string
    currentExecutionId: string
    onSelectExecution: (executionId: string) => void
}

export function TestHistoryTab({
    testId,
    currentExecutionId,
    onSelectExecution,
}: TestHistoryTabProps) {
    const {executions, loading, error} = useTestExecutionHistory(testId)

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-primary-400" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="text-center py-8">
                <p className="text-danger-600 dark:text-danger-400">
                    Error loading execution history: {error}
                </p>
            </div>
        )
    }

    return (
        <div>
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                Execution History
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                View and compare previous test executions. Each execution maintains independent
                attachments and results.
            </p>
            <ExecutionList
                executions={executions}
                currentExecutionId={currentExecutionId}
                onSelectExecution={onSelectExecution}
            />
        </div>
    )
}

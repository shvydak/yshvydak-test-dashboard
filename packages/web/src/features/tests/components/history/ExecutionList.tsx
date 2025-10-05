import {TestResult} from '@yshvydak/core'
import {ExecutionCard} from './ExecutionCard'

export interface ExecutionListProps {
    executions: TestResult[]
    currentExecutionId: string
    onSelectExecution: (executionId: string) => void
}

export function ExecutionList({
    executions,
    currentExecutionId,
    onSelectExecution,
}: ExecutionListProps) {
    if (executions.length === 0) {
        return (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No execution history available
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {executions.map((execution, index) => (
                <ExecutionCard
                    key={execution.id}
                    execution={execution}
                    isLatest={index === 0}
                    isCurrent={execution.id === currentExecutionId}
                    onSelect={() => onSelectExecution(execution.id)}
                />
            ))}
        </div>
    )
}

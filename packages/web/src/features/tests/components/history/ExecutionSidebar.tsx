import {TestResult} from '@yshvydak/core'
import {StatusBadge, ActionButton} from '@shared/components'
import {formatLastRun, formatDuration} from '../../utils/formatters'
import {useTestsStore} from '../../store/testsStore'

export interface ExecutionSidebarProps {
    executions: TestResult[]
    currentExecutionId: string
    onSelectExecution: (executionId: string) => void
    testId: string
    onRerun: (testId: string) => void
    loading?: boolean
    error?: string
}

export function ExecutionSidebar({
    executions,
    currentExecutionId,
    onSelectExecution,
    testId,
    onRerun,
    loading,
    error,
}: ExecutionSidebarProps) {
    const {runningTests, getIsAnyTestRunning} = useTestsStore()
    const isRunning = runningTests.has(testId)
    const isAnyTestRunning = getIsAnyTestRunning()

    return (
        <div className="w-80 border-l border-gray-200 dark:border-gray-700 flex flex-col bg-gray-50 dark:bg-gray-900/50">
            {/* Sticky Header */}
            <div className="sticky top-0 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 px-4 py-4 z-10">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">
                            Execution History
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {executions.length}{' '}
                            {executions.length === 1 ? 'execution' : 'executions'}
                        </p>
                    </div>
                    <ActionButton
                        size="sm"
                        variant="primary"
                        isRunning={isRunning}
                        runningText="Running..."
                        icon="▶️"
                        disabled={isAnyTestRunning}
                        onClick={() => onRerun(testId)}>
                        Run
                    </ActionButton>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
                {loading && (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-primary-400" />
                    </div>
                )}

                {error && (
                    <div className="text-center py-8 px-2">
                        <p className="text-xs text-danger-600 dark:text-danger-400">
                            Error loading history: {error}
                        </p>
                    </div>
                )}

                {!loading && !error && executions.length === 0 && (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                        <p className="text-sm">No execution history</p>
                    </div>
                )}

                {!loading && !error && executions.length > 0 && (
                    <div className="space-y-2">
                        {executions.map((execution, index) => {
                            const isCurrent = execution.id === currentExecutionId
                            const isLatest = index === 0
                            const attachmentCount = execution.attachments?.length || 0

                            return (
                                <button
                                    key={execution.id}
                                    onClick={() => onSelectExecution(execution.id)}
                                    disabled={isCurrent}
                                    className={`group w-full text-left rounded-lg p-3 transition-all ${
                                        isCurrent
                                            ? 'bg-primary-100 dark:bg-primary-900/30 border-2 border-primary-500 shadow-sm cursor-default'
                                            : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-md cursor-pointer'
                                    }`}>
                                    {/* Header with Badge and Date */}
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <StatusBadge status={execution.status as any} />
                                        {isLatest && (
                                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 uppercase tracking-wider">
                                                Latest
                                            </span>
                                        )}
                                    </div>

                                    {/* Date */}
                                    <div className="text-xs font-medium text-gray-900 dark:text-white mb-1.5">
                                        {formatLastRun(execution)}
                                    </div>

                                    {/* Metadata */}
                                    <div className="flex items-center gap-2 text-[11px] text-gray-600 dark:text-gray-400 mb-2">
                                        <span>⏱ {formatDuration(execution.duration)}</span>
                                        {attachmentCount > 0 && (
                                            <>
                                                <span>•</span>
                                                <span>📎 {attachmentCount}</span>
                                            </>
                                        )}
                                    </div>

                                    {/* Current Indicator */}
                                    {isCurrent && (
                                        <div className="flex items-center gap-1 text-primary-700 dark:text-primary-300 font-semibold text-[11px] mt-1">
                                            <span>✓</span>
                                            <span>Currently viewing</span>
                                        </div>
                                    )}

                                    {/* Hover Action Hint */}
                                    {!isCurrent && (
                                        <div className="text-primary-600 dark:text-primary-400 text-[11px] font-medium mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            Click to view →
                                        </div>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

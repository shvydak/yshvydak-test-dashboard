import {TestResult} from '@yshvydak/core'
import {ActionButton} from '@shared/components'
import {useTestsStore} from '../../store/testsStore'
import {ExecutionItem} from './ExecutionItem'

export interface ExecutionSidebarProps {
    executions: TestResult[]
    currentExecutionId: string
    onSelectExecution: (executionId: string) => void
    onDeleteExecution: (executionId: string) => void
    testId: string
    onRerun: (testId: string) => void
    loading?: boolean
    error?: string
}

export function ExecutionSidebar({
    executions,
    currentExecutionId,
    onSelectExecution,
    onDeleteExecution,
    testId,
    onRerun,
    loading,
    error,
}: ExecutionSidebarProps) {
    const {runningTests, getIsAnyTestRunning, activeProgress} = useTestsStore()
    const isAnyTestRunning = getIsAnyTestRunning()

    // Check if test is running from either source:
    // 1. runningTests Set (for single test reruns) - uses execution ID
    // 2. activeProgress.runningTests (for group/all runs) - uses testId
    // Note: testId prop is the execution ID, but we need test.testId for matching
    // Get the actual testId from the current test (first execution or matched by ID)
    const currentTest = executions.find((e) => e.id === testId) || executions[0]
    const actualTestId = currentTest?.testId || testId
    const runningInfo = activeProgress?.runningTests.find((t) => t.testId === actualTestId)
    const isRunning = runningTests.has(testId) || !!runningInfo

    return (
        <div className="w-80 border-l border-gray-200 dark:border-gray-700 flex flex-col bg-gray-50 dark:bg-gray-800">
            {/* Sticky Header */}
            <div className="sticky top-0 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4 z-10">
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
                        {executions.map((execution, index) => (
                            <ExecutionItem
                                key={execution.id}
                                execution={execution}
                                isCurrent={execution.id === currentExecutionId}
                                isLatest={index === 0}
                                onSelect={onSelectExecution}
                                onDelete={onDeleteExecution}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

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
        <div className="w-80 h-full min-h-0 border-l border-gray-200/70 dark:border-white/[0.06] flex flex-col bg-gray-50 dark:bg-white/[0.02]">
            {/* Sticky Header */}
            <div className="sticky top-0 bg-gray-50/80 backdrop-blur-xl dark:bg-gray-900/40 border-b border-gray-200/70 dark:border-white/[0.06] px-4 py-4 z-10">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                            Execution History
                        </h3>
                        <p className="mt-1.5 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium tabular-nums text-gray-500 ring-1 ring-inset ring-gray-500/10 dark:bg-white/[0.06] dark:text-gray-400 dark:ring-white/10">
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
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
                {loading && (
                    <div className="space-y-2">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="skeleton h-24 w-full rounded-xl" />
                        ))}
                    </div>
                )}

                {error && (
                    <div className="rounded-2xl border border-danger-200/70 bg-danger-50 ring-1 ring-inset ring-danger-600/10 px-3 py-4 text-center dark:border-danger-500/20 dark:bg-danger-500/10 dark:ring-danger-400/15">
                        <p className="text-xs font-medium text-danger-700 dark:text-danger-300">
                            Error loading history: {error}
                        </p>
                    </div>
                )}

                {!loading && !error && executions.length === 0 && (
                    <div className="flex flex-col items-center justify-center text-center py-12">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-xl dark:bg-white/[0.04]">
                            🕓
                        </div>
                        <p className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-300">
                            No execution history
                        </p>
                    </div>
                )}

                {!loading && !error && executions.length > 0 && (
                    <div className="space-y-2 stagger">
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

import {TestResult} from '@yshvydak/core'
import {Card} from '@shared/components'
import {useTestSort} from '../hooks'
import {formatDuration, formatLastRun} from '../utils'
import {StatusBadge, ActionButton, LoadingSpinner, Badge} from '@shared/components'
import {useTestsStore} from '../store/testsStore'

export interface TestsTableViewProps {
    tests: TestResult[]
    selectedTest: TestResult | null
    onTestSelect: (test: TestResult) => void
    onTestRerun: (testId: string) => void
}

export function TestsTableView({
    tests,
    selectedTest,
    onTestSelect,
    onTestRerun,
}: TestsTableViewProps) {
    const {sortedTests, handleSort, getSortIcon} = useTestSort(tests)
    const {runningTests, getIsAnyTestRunning, activeProgress} = useTestsStore()
    const isAnyTestRunning = getIsAnyTestRunning()

    return (
        <Card padding="none">
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                            <th
                                className="text-left py-4 px-6 text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                                onClick={() => handleSort('status')}>
                                Status {getSortIcon('status')}
                            </th>
                            <th
                                className="text-left py-4 px-6 text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                                onClick={() => handleSort('name')}>
                                Test Name {getSortIcon('name')}
                            </th>
                            <th className="text-left py-4 px-6 text-sm font-medium text-gray-600 dark:text-gray-400">
                                File Path
                            </th>
                            <th
                                className="text-left py-4 px-6 text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                                onClick={() => handleSort('duration')}>
                                Duration {getSortIcon('duration')}
                            </th>
                            <th
                                className="text-left py-4 px-6 text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                                onClick={() => handleSort('date')}>
                                Last Run {getSortIcon('date')}
                            </th>
                            <th className="text-left py-4 px-6 text-sm font-medium text-gray-600 dark:text-gray-400">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedTests.map((test) => {
                            // Check if test is running from either source:
                            // 1. runningTests Set (for single test reruns)
                            // 2. activeProgress.runningTests (for group/all runs)
                            const runningInfo = activeProgress?.runningTests.find(
                                (t) => t.testId === test.testId
                            )
                            const isRunning = runningTests.has(test.id) || !!runningInfo

                            return (
                                <tr
                                    key={test.id}
                                    className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer ${
                                        isRunning
                                            ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500 animate-pulse'
                                            : selectedTest?.id === test.id
                                              ? 'bg-primary-50 dark:bg-primary-900/20'
                                              : ''
                                    }`}
                                    onClick={() => onTestSelect(test)}>
                                    <td className="py-4 px-6">
                                        {isRunning ? (
                                            <Badge variant="info" size="md">
                                                <LoadingSpinner size="sm" className="mr-1" />
                                                <span>Running...</span>
                                            </Badge>
                                        ) : (
                                            <StatusBadge status={test.status as any} />
                                        )}
                                    </td>
                                    <td className="py-4 px-6">
                                        <div className="font-medium text-gray-900 dark:text-white">
                                            {test.name}
                                        </div>
                                        {test.errorMessage && (
                                            <div className="text-xs text-red-600 dark:text-red-400 mt-1 truncate max-w-xs">
                                                {test.errorMessage}
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-4 px-6 text-sm text-gray-600 dark:text-gray-400 font-mono">
                                        {test.filePath}
                                    </td>
                                    <td className="py-4 px-6 text-sm text-gray-600 dark:text-gray-400">
                                        {formatDuration(test.duration)}
                                    </td>
                                    <td className="py-4 px-6 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                        {formatLastRun(test)}
                                    </td>
                                    <td className="py-4 px-6">
                                        {(() => {
                                            // Check if test is running from either source:
                                            // 1. runningTests Set (for single test reruns)
                                            // 2. activeProgress.runningTests (for group/all runs)
                                            const runningInfo = activeProgress?.runningTests.find(
                                                (t) => t.testId === test.testId
                                            )
                                            const isRunning =
                                                runningTests.has(test.id) || !!runningInfo

                                            return (
                                                <ActionButton
                                                    size="sm"
                                                    variant="primary"
                                                    isRunning={isRunning}
                                                    runningText="Running..."
                                                    icon="▶️"
                                                    disabled={isAnyTestRunning}
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        onTestRerun(test.id)
                                                    }}>
                                                    Run
                                                </ActionButton>
                                            )
                                        })()}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </Card>
    )
}

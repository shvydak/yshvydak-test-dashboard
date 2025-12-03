import {TestResult} from '@yshvydak/core'
import {StatusBadge, ActionButton, LoadingSpinner, Badge} from '@shared/components'
import {formatDuration, formatLastRun} from '../utils'
import {useTestsStore} from '../store/testsStore'
import {LinkifiedText} from '@/components/atoms/LinkifiedText'
import {truncateText} from '@/utils/linkify.util'

export interface TestRowProps {
    test: TestResult
    selected: boolean
    onSelect: (test: TestResult) => void
    onRerun: (testId: string) => void
}

export function TestRow({test, selected, onSelect, onRerun}: TestRowProps) {
    const {runningTests, getIsAnyTestRunning, activeProgress} = useTestsStore()
    const isAnyTestRunning = getIsAnyTestRunning()

    // Find if this test is currently running in the active progress
    const runningInfo = activeProgress?.runningTests.find((t) => t.testId === test.testId)

    // Check if test is running from either source:
    // 1. runningTests Set (for single test reruns)
    // 2. activeProgress.runningTests (for group/all runs)
    const isRunning = runningTests.has(test.id) || !!runningInfo

    return (
        <tr
            className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer ${
                isRunning
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500 animate-pulse'
                    : selected
                      ? 'bg-primary-50 dark:bg-primary-900/20'
                      : ''
            }`}
            onClick={() => onSelect(test)}>
            <td className="py-3 px-6 w-32">
                {isRunning ? (
                    <Badge variant="info" size="md">
                        <LoadingSpinner size="sm" className="mr-1" />
                        <span>Running...</span>
                    </Badge>
                ) : (
                    <StatusBadge status={test.status as any} />
                )}
            </td>
            <td className="py-3 px-6">
                <div className="font-medium text-gray-900 dark:text-white">{test.name}</div>
                {!runningInfo && test.note?.content && (
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate max-w-xs flex items-center gap-1">
                        <span>💬</span>
                        <LinkifiedText
                            text={truncateText(test.note.content, 50)}
                            className="truncate"
                        />
                    </div>
                )}
                {!runningInfo && test.errorMessage && (
                    <div className="text-xs text-red-600 dark:text-red-400 mt-1 truncate max-w-xs">
                        {test.errorMessage}
                    </div>
                )}
            </td>
            <td className="py-3 px-6 text-sm text-gray-600 dark:text-gray-400 w-24">
                {formatDuration(test.duration)}
            </td>
            <td className="py-3 px-6 text-sm text-gray-600 dark:text-gray-400 w-48">
                {formatLastRun(test)}
            </td>
            <td className="py-3 px-6 w-40">
                <ActionButton
                    size="sm"
                    variant="primary"
                    isRunning={isRunning}
                    runningText="Running..."
                    icon="▶️"
                    disabled={isAnyTestRunning}
                    onClick={(e) => {
                        e.stopPropagation()
                        onRerun(test.id)
                    }}>
                    Run
                </ActionButton>
            </td>
        </tr>
    )
}

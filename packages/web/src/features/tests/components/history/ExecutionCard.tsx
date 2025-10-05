import {TestResult} from '@yshvydak/core'
import {StatusBadge} from '@shared/components'
import {formatLastRun, formatDuration} from '../../utils/formatters'

export interface ExecutionCardProps {
    execution: TestResult
    isLatest: boolean
    isCurrent: boolean
    onSelect: () => void
}

export function ExecutionCard({
    execution,
    // isLatest,
    isCurrent,
    onSelect,
}: ExecutionCardProps) {
    const attachmentCount = execution.attachments?.length || 0

    return (
        <div
            className={`border rounded-lg p-4 transition-all ${
                isCurrent
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 shadow-md'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                    {/* {isLatest && (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                            LATEST
                        </span>
                    )} */}
                    <StatusBadge status={execution.status as any} />
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                    {formatLastRun(execution)}
                </span>
            </div>

            <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Duration: {formatDuration(execution.duration)}
                {attachmentCount > 0 && <> • Attachments: {attachmentCount}</>}
            </div>

            {isCurrent ? (
                <div className="text-primary-600 dark:text-primary-400 font-medium text-sm">
                    ✓ Currently viewing
                </div>
            ) : (
                <button
                    onClick={onSelect}
                    className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium text-sm transition-colors">
                    Switch to this execution →
                </button>
            )}
        </div>
    )
}

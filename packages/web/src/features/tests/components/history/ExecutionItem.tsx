import {useState} from 'react'
import {TestResult} from '@yshvydak/core'
import {StatusBadge} from '@shared/components'
import {formatLastRun, formatDuration} from '../../utils/formatters'

export interface ExecutionItemProps {
    execution: TestResult
    isCurrent: boolean
    isLatest: boolean
    onSelect: (executionId: string) => void
    onDelete: (executionId: string) => void
}

export function ExecutionItem({
    execution,
    isCurrent,
    isLatest,
    onSelect,
    onDelete,
}: ExecutionItemProps) {
    const [showRemoveButton, setShowRemoveButton] = useState(false)
    const attachmentCount = execution.attachments?.length || 0

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        onDelete(execution.id)
    }

    const handleClick = () => {
        // Don't switch if already viewing this execution
        if (isCurrent) return
        onSelect(execution.id)
    }

    return (
        <button
            onClick={handleClick}
            onMouseEnter={() => setShowRemoveButton(true)}
            onMouseLeave={() => setShowRemoveButton(false)}
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

            {/* Bottom Row: Current Indicator / Click to view + Remove Button */}
            <div className="flex items-center justify-between gap-2 mt-1">
                {/* Current Indicator */}
                {isCurrent && (
                    <div className="flex items-center gap-1 text-primary-700 dark:text-primary-300 font-semibold text-[11px]">
                        <span>✓</span>
                        <span>Currently viewing</span>
                    </div>
                )}

                {/* Hover Action Hint */}
                {!isCurrent && (
                    <div className="text-primary-600 dark:text-primary-400 text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        Click to view →
                    </div>
                )}

                {/* Remove Button on Hover - shows on ALL executions */}
                {showRemoveButton && (
                    <button
                        onClick={handleDeleteClick}
                        className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 uppercase tracking-wider hover:bg-red-200 dark:hover:bg-red-900/60 transition-all"
                        title="Remove this execution"
                        aria-label="Remove execution">
                        Remove
                    </button>
                )}
            </div>
        </button>
    )
}

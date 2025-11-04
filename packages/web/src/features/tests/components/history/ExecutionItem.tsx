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
    const [showDeleteIcon, setShowDeleteIcon] = useState(false)
    const attachmentCount = execution.attachments?.length || 0

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        onDelete(execution.id)
    }

    return (
        <button
            onClick={() => onSelect(execution.id)}
            disabled={isCurrent}
            onMouseEnter={() => setShowDeleteIcon(true)}
            onMouseLeave={() => setShowDeleteIcon(false)}
            className={`group w-full text-left rounded-lg p-3 transition-all relative ${
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

            {/* Delete Icon on Hover */}
            {!isCurrent && showDeleteIcon && (
                <button
                    onClick={handleDeleteClick}
                    className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-md bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 transition-all shadow-sm hover:shadow-md"
                    title="Delete this execution"
                    aria-label="Delete execution">
                    <span className="text-base">🗑️</span>
                </button>
            )}
        </button>
    )
}

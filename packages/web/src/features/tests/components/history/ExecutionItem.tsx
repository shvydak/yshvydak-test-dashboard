import {useState} from 'react'
import {Check, Timer, Paperclip, Archive} from 'lucide-react'
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
    // Attachments were purged to free disk space; the execution itself is kept.
    const isStripped = !!execution.attachmentsClearedAt && attachmentCount === 0

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        onDelete(execution.id)
    }

    const handleClick = () => {
        // Don't switch if already viewing this execution
        if (isCurrent) return
        onSelect(execution.id)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        // Mirror native button activation: Enter and Space select the execution.
        if (isCurrent) return
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect(execution.id)
        }
    }

    return (
        <div
            role="button"
            tabIndex={isCurrent ? -1 : 0}
            aria-disabled={isCurrent || undefined}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            onMouseEnter={() => setShowRemoveButton(true)}
            onMouseLeave={() => setShowRemoveButton(false)}
            className={`group w-full text-left rounded-xl p-3 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                isCurrent
                    ? 'bg-primary-50 ring-1 ring-inset ring-primary-600/20 shadow-soft cursor-default dark:bg-primary-500/15 dark:ring-primary-400/25'
                    : 'bg-white border border-gray-200/80 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-card-hover cursor-pointer dark:bg-gray-800/70 dark:border-white/[0.07] dark:hover:border-white/[0.12]'
            }`}>
            {/* Header with Badge and Date */}
            <div className="flex items-start justify-between gap-2 mb-2">
                <StatusBadge status={execution.status as any} />
                {isLatest && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-success-50 text-success-700 ring-1 ring-inset ring-success-600/15 dark:bg-success-500/10 dark:text-success-300 dark:ring-success-400/20 uppercase tracking-wider">
                        Latest
                    </span>
                )}
            </div>

            {/* Date */}
            <div className="text-xs font-medium text-gray-900 dark:text-white mb-1.5">
                {formatLastRun(execution)}
            </div>

            {/* Metadata */}
            <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-gray-400 dark:text-gray-500 mb-2">
                <span className="flex items-center gap-1">
                    <Timer className="h-3 w-3" /> {formatDuration(execution.duration)}
                </span>
                {attachmentCount > 0 && (
                    <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                            <Paperclip className="h-3 w-3" /> {attachmentCount}
                        </span>
                    </>
                )}
                {isStripped && (
                    <>
                        <span>•</span>
                        <span
                            className="flex items-center gap-1 text-gray-400 dark:text-gray-500"
                            title="Attachments removed to free disk space">
                            <Archive className="h-3 w-3" /> archived
                        </span>
                    </>
                )}
            </div>

            {/* Bottom Row: Current Indicator / Click to view + Remove Button */}
            <div className="flex items-center justify-between gap-2 mt-1">
                {/* Current Indicator */}
                {isCurrent && (
                    <div className="flex items-center gap-1 text-primary-700 dark:text-primary-300 font-semibold text-[11px]">
                        <Check className="h-3 w-3" />
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
                        className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-danger-50 text-danger-700 ring-1 ring-inset ring-danger-600/15 dark:bg-danger-500/10 dark:text-danger-300 dark:ring-danger-400/20 uppercase tracking-wider hover:bg-danger-100 dark:hover:bg-danger-500/20 transition-all duration-150"
                        title="Remove this execution"
                        aria-label="Remove execution">
                        Remove
                    </button>
                )}
            </div>
        </div>
    )
}

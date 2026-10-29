import {useState} from 'react'
import {Check, X, Play, FileX} from 'lucide-react'
import {StatusBadge, Button} from '@shared/components'
import {formatLastRun} from '../../utils/formatters'
import {TicketChips} from '../TicketChips'
import type {DisplayTag} from '../../utils/jiraTags'

export interface TestDetailHeaderProps {
    testName: string
    testStatus: string
    tags?: DisplayTag[]
    executionDate?: string
    isLatest: boolean
    onClose: () => void
    onBackToLatest: () => void
    onDelete?: () => void
    onRerun?: () => void
    isRunning?: boolean
    isAnyTestRunning?: boolean
    /** Latest Discover no longer lists this test: Run is off and a delete notice shows. */
    notInCode?: boolean
    project?: string
}

export function TestDetailHeader({
    testName,
    testStatus,
    tags = [],
    executionDate,
    isLatest,
    onClose,
    onBackToLatest,
    onDelete,
    onRerun,
    isRunning,
    isAnyTestRunning,
    notInCode = false,
    project,
}: TestDetailHeaderProps) {
    const [copied, setCopied] = useState(false)

    const handleCopyTestName = async () => {
        try {
            await navigator.clipboard.writeText(testName)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error('Failed to copy test name:', err)
        }
    }

    return (
        <div className="flex items-start md:items-center justify-between p-4 md:p-6 border-b border-gray-200/70 dark:border-white/[0.06] gap-3">
            <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 md:space-x-3 mb-1.5">
                    <StatusBadge status={testStatus as any} />
                    <h2
                        onClick={handleCopyTestName}
                        className="text-base md:text-xl font-semibold tracking-tight text-gray-900 dark:text-white cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 transition-colors select-none truncate"
                        title="Click to copy test name">
                        {copied ? (
                            <span className="flex items-center gap-2">
                                <span>Copied!</span>
                                <Check className="w-5 h-5 text-success-500" />
                            </span>
                        ) : (
                            testName
                        )}
                    </h2>
                </div>

                <TicketChips tags={tags} className="mb-1.5" />

                {notInCode && (
                    <div className="mb-1.5 flex items-start gap-1.5 text-xs md:text-sm text-gray-500 dark:text-gray-400">
                        <FileX className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <span>
                            Not found in {project || 'this project'}&apos;s latest Discover. Delete
                            removes this test&apos;s whole history in every project.
                        </span>
                    </div>
                )}

                {!isLatest && executionDate && (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 mt-2 gap-1">
                        <span className="text-xs md:text-sm text-gray-500 dark:text-gray-400">
                            Viewing execution: {formatLastRun({createdAt: executionDate})}
                        </span>
                        <button
                            onClick={onBackToLatest}
                            className="text-xs md:text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium transition-colors">
                            ← Back to latest
                        </button>
                    </div>
                )}

                {isLatest && (
                    <span className="text-xs md:text-sm text-gray-400 dark:text-gray-500">
                        Latest execution
                    </span>
                )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
                {/* Mobile: Show Run button instead of Delete */}
                {onRerun && (
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={onRerun}
                        disabled={isRunning || isAnyTestRunning || notInCode}
                        className="md:hidden">
                        {isRunning ? (
                            'Running...'
                        ) : (
                            <span className="flex items-center gap-1.5">
                                <Play className="w-3.5 h-3.5" />
                                Run
                            </span>
                        )}
                    </Button>
                )}
                {/* Delete: desktop only, except for a not-in-code test (also on mobile) */}
                {onDelete && (
                    <Button
                        variant="danger"
                        size="sm"
                        onClick={onDelete}
                        // Mobile has no Delete except here, where the notice and the row line point to it
                        className={notInCode ? 'inline-flex' : 'hidden md:inline-flex'}>
                        Delete Test
                    </Button>
                )}
                <button
                    onClick={onClose}
                    className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200 transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>
        </div>
    )
}

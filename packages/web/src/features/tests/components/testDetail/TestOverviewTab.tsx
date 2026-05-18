import {TestResult} from '@yshvydak/core'
import {LoadingSpinner} from '@shared/components'
import {AttachmentWithBlobURL} from '../../types/attachment.types'
import {AttachmentItem} from './AttachmentItem'
import {TestNoteEditor} from './TestNoteEditor'
import {TestConsoleOutput} from './TestConsoleTab'
import {formatErrorLines} from '../../../../utils/errorFormatter'
import {formatDuration} from '../../utils/formatters'

export interface TestOverviewTabProps {
    test: TestResult
    attachments: AttachmentWithBlobURL[]
    attachmentsLoading: boolean
    attachmentsError: string | null
    onAttachmentsError: (error: string) => void
    onSaveNote: (note: string) => Promise<void>
    onDeleteNote: () => Promise<void>
}

export function TestOverviewTab({
    test,
    attachments,
    attachmentsLoading,
    attachmentsError,
    onAttachmentsError,
    onSaveNote,
    onDeleteNote,
}: TestOverviewTabProps) {
    const hasConsoleOutput = (test.metadata?.console?.entries?.length ?? 0) > 0

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Attachments Section */}
            <div>
                <div className="flex items-start justify-between mb-4 gap-4">
                    <h3 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
                        <span>📎</span>
                        <span>Attachments</span>
                        <span className="ml-1 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium tabular-nums text-gray-500 ring-1 ring-inset ring-gray-500/10 dark:bg-white/[0.06] dark:text-gray-400 dark:ring-white/10">
                            {attachmentsLoading ? '...' : attachments.length}
                        </span>
                    </h3>

                    {/* Test Notes Section - Next to Attachments heading */}
                    <div className="flex-1 max-w-2xl">
                        <TestNoteEditor
                            testId={test.testId}
                            initialNote={test.note?.content}
                            onSave={onSaveNote}
                            onDelete={onDeleteNote}
                        />
                    </div>
                </div>

                {attachmentsLoading && (
                    <div className="text-center py-10 bg-gray-50 dark:bg-white/[0.03] rounded-2xl border border-gray-200/70 dark:border-white/[0.06]">
                        <LoadingSpinner size="md" />
                        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                            Loading attachments...
                        </p>
                    </div>
                )}

                {!attachmentsLoading && attachmentsError && (
                    <div className="text-center py-8 bg-danger-50 dark:bg-danger-500/10 rounded-2xl border border-danger-200/70 ring-1 ring-inset ring-danger-600/10 dark:border-danger-500/20 dark:ring-danger-400/20">
                        <p className="text-sm font-medium text-danger-700 dark:text-danger-300">
                            {attachmentsError}
                        </p>
                    </div>
                )}

                {!attachmentsLoading && !attachmentsError && attachments.length === 0 && (
                    <div className="flex flex-col items-center justify-center text-center py-12 bg-gray-50 dark:bg-white/[0.03] rounded-2xl border border-gray-200/70 dark:border-white/[0.06]">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-xl dark:bg-white/[0.04]">
                            📎
                        </div>
                        <p className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-300">
                            No attachments
                        </p>
                        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                            No attachments found for this test
                        </p>
                    </div>
                )}

                {!attachmentsLoading && !attachmentsError && attachments.length > 0 && (
                    <div className="grid grid-cols-1 gap-4">
                        {attachments.map((attachment, index) => {
                            const isFirstAttachment = index === 0

                            return (
                                <div key={attachment.id} className="space-y-4">
                                    {/* Render console output above first attachment */}
                                    {hasConsoleOutput && isFirstAttachment && (
                                        <div className="space-y-2">
                                            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                                Test Output
                                            </div>
                                            <TestConsoleOutput test={test} />
                                        </div>
                                    )}

                                    <AttachmentItem
                                        attachment={attachment}
                                        onError={onAttachmentsError}
                                    />
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Divider */}
            <div className="border-t border-gray-200/70 dark:border-white/[0.06]" />

            {/* Test Information Section */}
            <div>
                <h3 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white mb-4">
                    Test Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-card dark:border-white/[0.07] dark:bg-gray-800/70 dark:backdrop-blur-xl">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-4">
                            Test Details
                        </h3>
                        <div className="space-y-3.5">
                            <div>
                                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                    File Path
                                </span>
                                <p className="font-mono text-sm text-gray-900 dark:text-white break-all">
                                    {test.filePath}
                                </p>
                            </div>
                            <div>
                                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                    Duration
                                </span>
                                <p className="font-mono text-sm tabular-nums text-gray-900 dark:text-white">
                                    {formatDuration(test.duration)}
                                </p>
                            </div>
                            <div>
                                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                    Run ID
                                </span>
                                <p className="font-mono text-xs text-gray-900 dark:text-white break-all">
                                    {test.runId}
                                </p>
                            </div>
                            {test.rerunCount && test.rerunCount > 0 && (
                                <div>
                                    <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                        Rerun Count
                                    </span>
                                    <p className="font-mono text-sm tabular-nums text-gray-900 dark:text-white">
                                        {test.rerunCount}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-card dark:border-white/[0.07] dark:bg-gray-800/70 dark:backdrop-blur-xl">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-4">
                            Execution Summary
                        </h3>
                        <div className="space-y-3.5">
                            <div>
                                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                    Status
                                </span>
                                <p className="text-sm font-medium capitalize text-gray-900 dark:text-white">
                                    {test.status}
                                </p>
                            </div>
                            <div>
                                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                    Attachments
                                </span>
                                <p className="text-sm text-gray-900 dark:text-white">
                                    {attachmentsLoading
                                        ? 'Running...'
                                        : `${attachments.length} file(s)`}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {test.errorMessage && (
                <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                        Errors
                    </h3>
                    <div className="rounded-2xl border border-danger-200/70 bg-danger-50 ring-1 ring-inset ring-danger-600/10 overflow-hidden dark:border-danger-500/20 dark:bg-danger-500/[0.07] dark:ring-danger-400/15">
                        <div className="px-4 py-2.5 border-b border-danger-200/60 dark:border-danger-500/15">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-danger-700 dark:text-danger-300">
                                Error Details
                            </span>
                        </div>
                        <div className="p-4 max-h-64 overflow-y-auto font-mono text-xs">
                            <div className="space-y-1">{formatErrorLines(test.errorMessage)}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(test.errorMessage as any)
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-all hover:bg-gray-50 hover:border-gray-300 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-300 dark:hover:bg-white/[0.09]">
                            📋 Copy Error
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

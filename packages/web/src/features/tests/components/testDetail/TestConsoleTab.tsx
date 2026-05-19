import {Copy, Terminal} from 'lucide-react'
import {TestResult} from '@yshvydak/core'

function getEntryStyle(type: string) {
    switch (type) {
        case 'stderr':
            return {
                badge: 'bg-danger-100 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300',
                text: 'text-danger-700 dark:text-danger-200',
            }
        default:
            return {
                badge: 'bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300',
                text: 'text-gray-700 dark:text-gray-200',
            }
    }
}

export interface TestConsoleOutputProps {
    test: TestResult
}

export function TestConsoleOutput({test}: TestConsoleOutputProps) {
    const entries = test.metadata?.console?.entries ?? []
    const truncated = !!test.metadata?.console?.truncated

    if (entries.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center text-center py-12 bg-gray-50 dark:bg-white/[0.03] rounded-2xl border border-gray-200/70 dark:border-white/[0.06]">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-white/[0.04]">
                    <Terminal className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-300">
                    No console output captured
                </p>
                <p className="text-xs mt-1 text-gray-400 dark:text-gray-500">
                    Shows Node stdout/stderr (console.log/error/warn)
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {truncated && (
                <div className="p-3 rounded-xl border border-warning-200/70 bg-warning-50 text-warning-700 ring-1 ring-inset ring-warning-600/15 dark:border-warning-500/20 dark:bg-warning-500/10 dark:text-warning-300 dark:ring-warning-400/20 text-sm">
                    Output was truncated (showing last lines).
                </div>
            )}

            <div className="rounded-2xl border border-gray-200/70 bg-gray-50 dark:border-white/[0.06] dark:bg-white/[0.03] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-200/70 dark:border-white/[0.06] flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        Console Output
                    </span>
                    <button
                        onClick={() => {
                            const text = entries.map((e) => e.text).join('')
                            navigator.clipboard.writeText(text)
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-all hover:bg-gray-50 hover:border-gray-300 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-300 dark:hover:bg-white/[0.09]">
                        <Copy className="h-3.5 w-3.5" /> Copy
                    </button>
                </div>

                <div className="p-4 max-h-[28rem] overflow-y-auto">
                    <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
                        {entries.map((entry, idx) => {
                            const styles = getEntryStyle(entry.type)
                            return (
                                <span key={idx} className="block">
                                    <span
                                        className={`inline-block mr-2 px-1.5 py-0.5 rounded-md ${styles.badge}`}>
                                        {entry.type}
                                    </span>
                                    <span className={styles.text}>{entry.text}</span>
                                </span>
                            )
                        })}
                    </pre>
                </div>
            </div>
        </div>
    )
}

import {TestResult} from '@yshvydak/core'

function getEntryStyle(type: string) {
    switch (type) {
        case 'stderr':
            return {
                badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
                text: 'text-red-700 dark:text-red-200',
            }
        default:
            return {
                badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
                text: 'text-gray-800 dark:text-gray-200',
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
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400">
                <p>No console output captured</p>
                <p className="text-sm mt-1">Shows Node stdout/stderr (console.log/error/warn)</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {truncated && (
                <div className="p-3 rounded-md border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200 text-sm">
                    Output was truncated (showing last lines).
                </div>
            )}

            <div className="bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                        Console Output
                    </span>
                    <button
                        onClick={() => {
                            const text = entries.map((e) => e.text).join('')
                            navigator.clipboard.writeText(text)
                        }}
                        className="text-xs px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors">
                        📋 Copy
                    </button>
                </div>

                <div className="p-3 max-h-[28rem] overflow-y-auto">
                    <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                        {entries.map((entry, idx) => {
                            const styles = getEntryStyle(entry.type)
                            return (
                                <span key={idx} className="block">
                                    <span
                                        className={`inline-block mr-2 px-1.5 py-0.5 rounded ${styles.badge}`}>
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

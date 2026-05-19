import {TestResult} from '@yshvydak/core'
import {formatDuration} from '../../utils/formatters'

export interface TestStepsTabProps {
    test: TestResult
}

export function TestStepsTab({test}: TestStepsTabProps) {
    if (!test.steps || test.steps.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center text-center py-12 bg-gray-50 dark:bg-white/[0.03] rounded-2xl border border-gray-200/70 dark:border-white/[0.06] animate-fade-in">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-xl dark:bg-white/[0.04]">
                    🔄
                </div>
                <p className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-300">
                    The feature in development...
                </p>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    No test steps recorded
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-4 animate-fade-in">
            <div className="space-y-3 stagger">
                {test.steps.map((step, index) => (
                    <div
                        key={index}
                        className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-card dark:border-white/[0.07] dark:bg-gray-800/70 dark:backdrop-blur-xl">
                        <div className="flex items-center justify-between gap-3">
                            <h4 className="font-semibold tracking-tight text-gray-900 dark:text-white">
                                Step {index + 1}: {step.title}
                            </h4>
                            <span className="font-mono text-xs tabular-nums text-gray-400 dark:text-gray-500">
                                {formatDuration(step.duration)}
                            </span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Category: {step.category}
                        </p>
                        {step.error && (
                            <div className="mt-3 p-3 bg-danger-50 dark:bg-danger-500/[0.07] border border-danger-200/70 ring-1 ring-inset ring-danger-600/10 dark:border-danger-500/20 dark:ring-danger-400/15 rounded-xl">
                                <pre className="text-xs font-mono text-danger-700 dark:text-danger-200 whitespace-pre-wrap">
                                    {step.error}
                                </pre>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

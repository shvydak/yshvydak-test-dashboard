import {StatusBadge} from '@shared/components'
import {formatLastRun} from '../../utils/formatters'

export interface TestDetailHeaderProps {
    testName: string
    testStatus: string
    executionDate?: string
    isLatest: boolean
    onClose: () => void
    onBackToLatest: () => void
}

export function TestDetailHeader({
    testName,
    testStatus,
    executionDate,
    isLatest,
    onClose,
    onBackToLatest,
}: TestDetailHeaderProps) {
    return (
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex-1">
                <div className="flex items-center space-x-3 mb-1">
                    <StatusBadge status={testStatus as any} />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        {testName}
                    </h2>
                </div>

                {!isLatest && executionDate && (
                    <div className="flex items-center space-x-2 mt-2">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                            Viewing execution: {formatLastRun({createdAt: executionDate})}
                        </span>
                        <button
                            onClick={onBackToLatest}
                            className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium transition-colors">
                            ← Back to latest
                        </button>
                    </div>
                )}

                {isLatest && (
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                        Latest execution
                    </span>
                )}
            </div>

            <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                    />
                </svg>
            </button>
        </div>
    )
}

import {TestResult} from '@yshvydak/core'
import {getStatusIcon, getStatusColor, formatDuration} from '@features/tests/utils/formatters'

interface RecentTestsProps {
    tests: TestResult[]
}

export default function RecentTests({tests}: RecentTestsProps) {
    if (tests.length === 0) {
        return (
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">Recent Tests</h3>
                    <p className="card-description">Latest test executions</p>
                </div>
                <div className="card-content">
                    <div className="text-center py-8">
                        <p className="text-gray-500 dark:text-gray-400">No tests found</p>
                        <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                            Run some tests to see them here
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="card">
            <div className="card-header">
                <h3 className="card-title">Recent Tests</h3>
                <p className="card-description">Latest test executions</p>
            </div>
            <div className="card-content">
                <div className="space-y-3">
                    {tests.map((test) => (
                        <div
                            key={test.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                                <span className="text-lg" title={test.status}>
                                    {getStatusIcon(test.status)}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                        {test.name}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        {test.filePath}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center space-x-3 text-xs">
                                <span className={`font-medium ${getStatusColor(test.status)}`}>
                                    {test.status}
                                </span>
                                <span className="text-gray-500 dark:text-gray-400">
                                    {formatDuration(test.duration)}
                                </span>
                                {/* <span className="text-gray-400 dark:text-gray-500">
                                    {formatTestDateTime(test)} // TO FIX AS IN THE TESTS PAGE (TestList.stx)
                                </span> */}
                            </div>
                        </div>
                    ))}
                </div>

                {tests.length >= 5 && (
                    <div className="mt-4 text-center">
                        <button className="btn-secondary text-sm">View All Tests</button>
                    </div>
                )}
            </div>
        </div>
    )
}

import {TestResult} from '@yshvydak/core'
function formatTestDateTime(test: TestResult) {
    // For pending tests (discovered but never run), show N/A
    if (test.status === 'pending') {
        return 'N/A'
    }

    // For actual test runs, try updatedAt first (most recent), then createdAt, then timestamp
    const dateValue = test.updated_at || test.created_at || test.timestamp

    if (!dateValue) {
        return 'N/A'
    }

    try {
        const date = new Date(dateValue)
        // Check if date is valid
        if (isNaN(date.getTime())) {
            return 'N/A'
        }

        date.setHours(date.getHours() + 3)

        const formattedDate = date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        })
        const formattedTime = date.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        })
        return `${formattedTime}, ${formattedDate}`
    } catch (error) {
        return 'N/A'
    }
}

interface RecentTestsProps {
    tests: TestResult[]
}

function getStatusIcon(status: string) {
    switch (status) {
        case 'passed':
            return '✅'
        case 'failed':
            return '❌'
        case 'skipped':
            return '⏭️'
        default:
            return '❓'
    }
}

function getStatusColor(status: string) {
    switch (status) {
        case 'passed':
            return 'text-success-600 dark:text-success-400'
        case 'failed':
            return 'text-danger-600 dark:text-danger-400'
        case 'skipped':
            return 'text-gray-500 dark:text-gray-400'
        default:
            return 'text-gray-600 dark:text-gray-300'
    }
}

function formatDuration(duration: number) {
    if (duration < 1000) {
        return `${duration}ms`
    }
    return `${(duration / 1000).toFixed(1)}s`
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
                        <p className="text-gray-500 dark:text-gray-400">
                            No tests found
                        </p>
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
                                <span
                                    className={`font-medium ${getStatusColor(
                                        test.status,
                                    )}`}>
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
                        <button className="btn-secondary text-sm">
                            View All Tests
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

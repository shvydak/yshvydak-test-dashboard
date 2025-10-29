import {TestStatus} from '@shared/components/atoms'
import {TEST_STATUS_ICONS, TEST_STATUS_COLORS} from '../constants'

export function getStatusIcon(status: string): string {
    return TEST_STATUS_ICONS[status as TestStatus] || '❓'
}

export function getStatusColor(status: string): string {
    return (
        TEST_STATUS_COLORS[status as TestStatus] ||
        'text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800'
    )
}

export function formatDuration(duration: number): string {
    if (duration < 1000) {
        return `${duration}ms`
    }
    return `${(duration / 1000).toFixed(1)}s`
}

export function formatLastRun(test: any): string {
    if (test.status === 'pending') {
        return 'N/A'
    }

    const dateValue =
        test.updatedAt || test.updated_at || test.createdAt || test.created_at || test.timestamp

    if (!dateValue) {
        return 'N/A'
    }

    try {
        const date = new Date(dateValue)
        if (isNaN(date.getTime())) {
            return 'N/A'
        }

        date.setHours(date.getHours() + 2)

        const formattedDate = date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        })
        const formattedTime = date.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
            second: '2-digit',
        })
        return `${formattedTime} ${formattedDate}`
    } catch {
        return 'N/A'
    }
}

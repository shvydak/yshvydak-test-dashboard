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

/** "just now", "5 min ago", "2 h ago", "3 d ago" for an ISO time. */
export function formatTimeAgo(iso: string, now: number = Date.now()): string {
    const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
    if (Number.isNaN(seconds) || seconds < 45) return 'just now'
    const minutes = Math.round(seconds / 60)
    if (minutes < 60) return `${minutes} min ago`
    const hours = Math.round(minutes / 60)
    if (hours < 24) return `${hours} h ago`
    return `${Math.round(hours / 24)} d ago`
}

export function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes'

    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']

    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export function formatLastRun(test: any): string {
    if (test.status === 'pending') {
        return 'N/A'
    }

    const dateValue =
        test.createdAt || test.created_at || test.timestamp || test.updatedAt || test.updated_at

    if (!dateValue) {
        return 'N/A'
    }

    try {
        const date = new Date(dateValue)
        if (isNaN(date.getTime())) {
            return 'N/A'
        }

        // Use system timezone (automatically uses browser's locale timezone)
        // This ensures the time matches the user's system clock
        const formattedDateTime = date.toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        })

        // Format: "DD/MM/YYYY, HH:MM:SS" -> "HH:MM:SS DD/MM/YYYY"
        const [datePart, timePart] = formattedDateTime.split(', ')
        return `${timePart} ${datePart}`
    } catch {
        return 'N/A'
    }
}

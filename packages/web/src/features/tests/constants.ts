import {TestStatus} from '@shared/components/atoms'

export const TEST_STATUS_COLORS: Record<TestStatus, string> = {
    passed: 'text-success-600 dark:text-success-400 bg-success-50 dark:bg-success-900/20',
    failed: 'text-danger-600 dark:text-danger-400 bg-danger-50 dark:bg-danger-900/20',
    skipped: 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800',
    pending: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
} as const

export const TEST_STATUS_ICONS: Record<TestStatus, string> = {
    passed: '✅',
    failed: '❌',
    skipped: '⏭️',
    pending: '⏸️',
} as const

export const FILTER_OPTIONS = [
    {key: 'all', label: 'All'},
    {key: 'passed', label: 'Passed'},
    {key: 'failed', label: 'Failed'},
    {key: 'skipped', label: 'Skipped'},
    {key: 'pending', label: 'Pending'},
    {key: 'noted', label: 'Noted'},
] as const

export type FilterKey = (typeof FILTER_OPTIONS)[number]['key']

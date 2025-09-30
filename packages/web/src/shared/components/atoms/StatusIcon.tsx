import { TEST_STATUS_ICONS } from '@features/tests/constants'

export type TestStatus = 'passed' | 'failed' | 'skipped' | 'pending'

export interface StatusIconProps {
	status: TestStatus
	className?: string
}

export function StatusIcon({ status, className = '' }: StatusIconProps) {
	const icon = TEST_STATUS_ICONS[status] || '❓'

	return <span className={className}>{icon}</span>
}
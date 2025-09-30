export type TestStatus = 'passed' | 'failed' | 'skipped' | 'pending'

export interface StatusIconProps {
	status: TestStatus
	className?: string
}

const STATUS_ICONS: Record<TestStatus, string> = {
	passed: '✅',
	failed: '❌',
	skipped: '⏭️',
	pending: '⏸️',
}

export function StatusIcon({ status, className = '' }: StatusIconProps) {
	const icon = STATUS_ICONS[status] || '❓'

	return <span className={className}>{icon}</span>
}

export function getStatusIcon(status: string): string {
	return STATUS_ICONS[status as TestStatus] || '❓'
}
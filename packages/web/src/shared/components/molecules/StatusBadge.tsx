import {Badge, StatusIcon, TestStatus} from '../atoms'

export interface StatusBadgeProps {
    status: TestStatus
    showIcon?: boolean
    size?: 'sm' | 'md'
    className?: string
}

export function StatusBadge({
    status,
    showIcon = true,
    size = 'md',
    className = '',
}: StatusBadgeProps) {
    const variantMap: Record<TestStatus, 'success' | 'danger' | 'warning' | 'info'> = {
        passed: 'success',
        failed: 'danger',
        skipped: 'warning',
        pending: 'info',
    }

    return (
        <Badge variant={variantMap[status]} size={size} className={className}>
            {showIcon && (
                <span className="mr-1">
                    <StatusIcon status={status} />
                </span>
            )}
            <span className="capitalize">{status}</span>
        </Badge>
    )
}

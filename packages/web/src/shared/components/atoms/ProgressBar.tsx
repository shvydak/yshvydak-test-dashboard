interface ProgressBarProps {
    percentage: number
    variant?: 'primary' | 'success' | 'danger'
    showLabel?: boolean
    height?: 'sm' | 'md' | 'lg'
    className?: string
}

export const ProgressBar = ({
    percentage,
    variant = 'primary',
    showLabel = true,
    height = 'md',
    className = '',
}: ProgressBarProps) => {
    const heightClass = {
        sm: 'h-1.5',
        md: 'h-2.5',
        lg: 'h-4',
    }[height]

    const colorClass = {
        primary: 'bg-gradient-to-r from-primary-500 to-primary-400',
        success: 'bg-gradient-to-r from-success-500 to-success-400',
        danger: 'bg-gradient-to-r from-danger-500 to-danger-400',
    }[variant]

    const safePercentage = Math.min(100, Math.max(0, percentage))

    return (
        <div className={`w-full ${className}`}>
            <div
                className={`w-full bg-gray-200/80 dark:bg-white/[0.06] rounded-full overflow-hidden ${heightClass}`}>
                <div
                    className={`${colorClass} ${heightClass} rounded-full transition-all duration-500 ease-out`}
                    style={{width: `${safePercentage}%`}}
                    role="progressbar"
                    aria-valuenow={safePercentage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                />
            </div>
            {showLabel && (
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1.5 tabular-nums">
                    {safePercentage.toFixed(0)}%
                </div>
            )}
        </div>
    )
}

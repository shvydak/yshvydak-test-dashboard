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
        sm: 'h-1',
        md: 'h-2',
        lg: 'h-4',
    }[height]

    const colorClass = {
        primary: 'bg-primary-600 dark:bg-primary-500',
        success: 'bg-success-600 dark:bg-success-500',
        danger: 'bg-danger-600 dark:bg-danger-500',
    }[variant]

    const safePercentage = Math.min(100, Math.max(0, percentage))

    return (
        <div className={`w-full ${className}`}>
            <div
                className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden ${heightClass}`}>
                <div
                    className={`${colorClass} ${heightClass} transition-all duration-300 ease-out`}
                    style={{width: `${safePercentage}%`}}
                    role="progressbar"
                    aria-valuenow={safePercentage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                />
            </div>
            {showLabel && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {safePercentage.toFixed(0)}%
                </div>
            )}
        </div>
    )
}

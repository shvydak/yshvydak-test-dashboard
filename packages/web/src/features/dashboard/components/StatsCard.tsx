interface StatsCardProps {
    title: string
    value: string | number
    icon: string
    className?: string
    loading?: boolean
    onClick?: () => void
}

export default function StatsCard({
    title,
    value,
    icon,
    className = '',
    loading = false,
    onClick,
}: StatsCardProps) {
    const isClickable = !!onClick

    return (
        <div
            className={`card ${isClickable ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''}`}
            onClick={onClick}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={
                isClickable
                    ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              onClick()
                          }
                      }
                    : undefined
            }>
            <div className="card-content">
                <div className="flex items-center justify-between">
                    <div className="flex-1">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            {title}
                        </p>
                        {loading ? (
                            <div className="mt-2 h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                        ) : (
                            <p
                                className={`text-2xl font-bold ${
                                    className || 'text-gray-900 dark:text-white'
                                }`}>
                                {value}
                            </p>
                        )}
                    </div>
                    <div className="text-3xl opacity-80">{icon}</div>
                </div>
            </div>
        </div>
    )
}

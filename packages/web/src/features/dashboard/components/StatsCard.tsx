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
            className={`group relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white p-5 shadow-card transition-all duration-200 dark:border-white/[0.07] dark:bg-gray-800/70 dark:backdrop-blur-xl ${
                isClickable
                    ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-card-hover active:scale-[0.99]'
                    : ''
            }`}
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
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        {title}
                    </p>
                    {loading ? (
                        <div className="mt-3 h-9 w-20 animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.06]" />
                    ) : (
                        <p
                            className={`mt-2 text-3xl font-bold tracking-tight tabular-nums ${
                                className || 'text-gray-900 dark:text-white'
                            }`}>
                            {value}
                        </p>
                    )}
                </div>
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100/80 text-xl transition-transform duration-200 group-hover:scale-105 dark:bg-white/[0.05]">
                    {icon}
                </div>
            </div>
        </div>
    )
}

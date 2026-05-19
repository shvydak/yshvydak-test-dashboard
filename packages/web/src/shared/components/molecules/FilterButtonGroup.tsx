export interface FilterOption {
    key: string
    label: string
    count?: number
}

export interface FilterButtonGroupProps {
    value: string
    onChange: (value: string) => void
    options: FilterOption[]
    className?: string
}

export function FilterButtonGroup({
    value,
    onChange,
    options,
    className = '',
}: FilterButtonGroupProps) {
    return (
        <div
            className={`inline-flex gap-1 rounded-2xl border border-gray-200/80 bg-gray-100/60 p-1 dark:border-white/[0.06] dark:bg-white/[0.04] ${className}`}>
            {options.map((option) => {
                const active = value === option.key
                return (
                    <button
                        key={option.key}
                        onClick={() => onChange(option.key)}
                        className={`flex-1 rounded-xl px-3.5 py-1.5 text-sm font-medium transition-all duration-200 ${
                            active
                                ? 'bg-white text-primary-700 shadow-soft dark:bg-primary-500/20 dark:text-primary-200'
                                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                        }`}>
                        {option.label}
                        {option.count !== undefined && (
                            <span
                                className={`ml-1.5 tabular-nums ${
                                    active
                                        ? 'text-primary-500 dark:text-primary-300'
                                        : 'text-gray-400 dark:text-gray-500'
                                }`}>
                                {option.count}
                            </span>
                        )}
                    </button>
                )
            })}
        </div>
    )
}

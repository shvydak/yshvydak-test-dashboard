export interface FilterOption {
    key: string
    label: string
    count?: number
    color?: 'primary' | 'success' | 'danger' | 'warning' | 'info'
}

export interface FilterButtonGroupProps {
    value: string
    onChange: (value: string) => void
    options: FilterOption[]
    className?: string
}

const activeClasses: Record<NonNullable<FilterOption['color']>, string> = {
    primary: 'bg-white text-primary-700 shadow-soft dark:bg-primary-500/20 dark:text-primary-200',
    success: 'bg-white text-success-700 shadow-soft dark:bg-success-500/20 dark:text-success-300',
    danger: 'bg-white text-danger-700 shadow-soft dark:bg-danger-500/20 dark:text-danger-300',
    warning: 'bg-white text-amber-700 shadow-soft dark:bg-amber-500/20 dark:text-amber-300',
    info: 'bg-white text-blue-700 shadow-soft dark:bg-blue-500/20 dark:text-blue-300',
}

const activeCountClasses: Record<NonNullable<FilterOption['color']>, string> = {
    primary: 'text-primary-500 dark:text-primary-300',
    success: 'text-success-500 dark:text-success-400',
    danger: 'text-danger-500 dark:text-danger-400',
    warning: 'text-amber-500 dark:text-amber-400',
    info: 'text-blue-500 dark:text-blue-400',
}

const inactiveCountClasses: Record<NonNullable<FilterOption['color']>, string> = {
    primary: 'text-gray-400 dark:text-gray-500',
    success: 'text-success-600 dark:text-success-400',
    danger: 'text-danger-600 dark:text-danger-400',
    warning: 'text-amber-600 dark:text-amber-400',
    info: 'text-blue-600 dark:text-blue-400',
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
                const color = option.color ?? 'primary'
                return (
                    <button
                        key={option.key}
                        onClick={() => onChange(option.key)}
                        className={`flex-1 rounded-xl px-3.5 py-1.5 text-sm font-medium transition-all duration-200 ${
                            active
                                ? activeClasses[color]
                                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                        }`}>
                        {option.label}
                        {option.count !== undefined && (
                            <span
                                className={`ml-1.5 tabular-nums ${
                                    active ? activeCountClasses[color] : inactiveCountClasses[color]
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

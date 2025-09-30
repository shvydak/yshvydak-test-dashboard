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
		<div className={`flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden ${className}`}>
			{options.map((option, index) => (
				<button
					key={option.key}
					onClick={() => onChange(option.key)}
					className={`px-4 py-2 text-sm font-medium transition-colors ${
						index < options.length - 1
							? 'border-r border-gray-200 dark:border-gray-700'
							: ''
					} ${
						value === option.key
							? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
							: 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
					}`}
				>
					{option.label}
					{option.count !== undefined && ` (${option.count})`}
				</button>
			))}
		</div>
	)
}
import { FilterButtonGroup, ViewModeToggle, ViewMode } from '@shared/components'
import { FilterKey, FILTER_OPTIONS } from '../constants'

export interface TestsListFiltersProps {
	filter: FilterKey
	onFilterChange: (filter: FilterKey) => void
	counts: {
		all: number
		passed: number
		failed: number
		skipped: number
		pending: number
	}
	viewMode: ViewMode
	onViewModeChange: (mode: ViewMode) => void
	onExpandAll?: () => void
	onCollapseAll?: () => void
}

export function TestsListFilters({
	filter,
	onFilterChange,
	counts,
	viewMode,
	onViewModeChange,
	onExpandAll,
	onCollapseAll,
}: TestsListFiltersProps) {
	const filterOptions = FILTER_OPTIONS.map((option) => ({
		...option,
		count: counts[option.key as keyof typeof counts],
	}))

	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center space-x-3">
				<ViewModeToggle value={viewMode} onChange={onViewModeChange} />

				{viewMode === 'grouped' && onExpandAll && onCollapseAll && (
					<div className="flex space-x-2">
						<button
							onClick={onExpandAll}
							className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
						>
							Expand All
						</button>
						<button
							onClick={onCollapseAll}
							className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
						>
							Collapse All
						</button>
					</div>
				)}
			</div>

			<FilterButtonGroup
				value={filter}
				onChange={(value) => onFilterChange(value as FilterKey)}
				options={filterOptions}
			/>
		</div>
	)
}
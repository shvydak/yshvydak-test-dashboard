import {FilterButtonGroup, ViewModeToggle, ViewMode, SearchInput} from '@shared/components'
import {FilterKey, FILTER_OPTIONS} from '../constants'

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
    searchQuery: string
    onSearchChange: (query: string) => void
    onExpandAll?: () => void
    onCollapseAll?: () => void
}

export function TestsListFilters({
    filter,
    onFilterChange,
    counts,
    viewMode,
    onViewModeChange,
    searchQuery,
    onSearchChange,
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
                            className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                            Expand All
                        </button>
                        <button
                            onClick={onCollapseAll}
                            className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                            Collapse All
                        </button>
                    </div>
                )}
            </div>

            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white ml-4">
                    {counts.all} test{counts.all !== 1 ? 's' : ''} found
                </h1>
            </div>

            <div className="flex-1 flex justify-center px-6">
                <SearchInput
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Search tests..."
                    className="w-96"
                />
            </div>

            <FilterButtonGroup
                value={filter}
                onChange={(value) => onFilterChange(value as FilterKey)}
                options={filterOptions}
            />
        </div>
    )
}

import {Play} from 'lucide-react'
import {FilterButtonGroup, SearchInput, Button} from '@shared/components'
import {FilterKey, FILTER_OPTIONS} from '../constants'
import {useTestsStore} from '../store/testsStore'

export interface TestsListFiltersProps {
    filter: FilterKey
    onFilterChange: (filter: FilterKey) => void
    counts: {
        all: number
        passed: number
        failed: number
        skipped: number
        pending: number
        noted: number
    }
    searchQuery: string
    onSearchChange: (query: string) => void
    onExpandAll?: () => void
    onCollapseAll?: () => void
}

export function TestsListFilters({
    filter,
    onFilterChange,
    counts,
    searchQuery,
    onSearchChange,
    onExpandAll,
    onCollapseAll,
}: TestsListFiltersProps) {
    const {runAllTests, isRunningAllTests, getIsAnyTestRunning} = useTestsStore()
    const isAnyTestRunning = getIsAnyTestRunning()

    const filterOptions = FILTER_OPTIONS.map((option) => ({
        ...option,
        count: counts[option.key as keyof typeof counts],
    }))

    return (
        <div className="rounded-2xl border border-gray-200/80 bg-white p-3 shadow-card dark:border-white/[0.07] dark:bg-gray-800/70 dark:backdrop-blur-xl md:p-4">
            <div className="space-y-4 md:space-y-0 md:flex md:items-center md:justify-between md:gap-4">
                {/* Top row on mobile: Run All + count + expand/collapse */}
                <div className="flex items-center justify-between md:justify-start md:space-x-4">
                    <div className="flex items-center space-x-2">
                        <Button
                            variant="primary"
                            loading={isRunningAllTests}
                            disabled={isAnyTestRunning}
                            onClick={runAllTests}>
                            {isRunningAllTests ? (
                                'Running...'
                            ) : (
                                <span className="flex items-center gap-1.5">
                                    <Play className="h-4 w-4" />
                                    Run All Tests
                                </span>
                            )}
                        </Button>

                        {onExpandAll && onCollapseAll && (
                            <div className="hidden sm:flex items-center gap-1 rounded-xl bg-gray-100/60 p-1 dark:bg-white/[0.04]">
                                <button
                                    onClick={onExpandAll}
                                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:bg-white hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white">
                                    Expand All
                                </button>
                                <button
                                    onClick={onCollapseAll}
                                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:bg-white hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white">
                                    Collapse All
                                </button>
                            </div>
                        )}
                    </div>

                    <h1 className="ml-3 whitespace-nowrap text-lg font-semibold tracking-tight text-gray-900 dark:text-white md:ml-2 md:text-xl">
                        <span className="tabular-nums">{counts.all}</span> Test
                        {counts.all !== 1 ? 's' : ''}{' '}
                        <span className="font-normal text-gray-400 dark:text-gray-500">found</span>
                    </h1>
                </div>

                {/* Search - full width on mobile */}
                <div className="md:flex-1 md:flex md:justify-center md:px-4">
                    <SearchInput
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Search tests..."
                        className="w-full md:w-96"
                    />
                </div>

                {/* Filters - horizontally scrollable on mobile */}
                <div className="-mx-1 overflow-x-auto overscroll-x-contain px-1 pb-1 md:mx-0 md:px-0 md:pb-0">
                    <FilterButtonGroup
                        value={filter}
                        onChange={(value) => onFilterChange(value as FilterKey)}
                        options={filterOptions}
                        className="min-w-max"
                    />
                </div>
            </div>
        </div>
    )
}

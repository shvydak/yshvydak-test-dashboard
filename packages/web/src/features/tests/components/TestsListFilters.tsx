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
}: TestsListFiltersProps) {
    const {runAllTests, isRunningAllTests, getIsAnyTestRunning} = useTestsStore()
    const isAnyTestRunning = getIsAnyTestRunning()

    const filterOptions = FILTER_OPTIONS.map((option) => ({
        ...option,
        count: counts[option.key as keyof typeof counts],
    }))

    return (
        <div className="space-y-2 md:space-y-0 md:flex md:items-center md:gap-3">
            {/* Row 1 on mobile / left part on desktop: Run All + Search */}
            <div className="flex items-center gap-2 shrink-0">
                <Button
                    variant="primary"
                    loading={isRunningAllTests}
                    disabled={isAnyTestRunning}
                    onClick={runAllTests}
                    className="shrink-0">
                    {isRunningAllTests ? (
                        'Running...'
                    ) : (
                        <span className="flex items-center gap-1.5">
                            <Play className="h-3.5 w-3.5" />
                            <span>Run All</span>
                        </span>
                    )}
                </Button>

                <SearchInput
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Search tests..."
                    className="flex-1 md:w-96 md:flex-none"
                />
            </div>

            {/* Row 2 on mobile / right part on desktop: Filters */}
            <div className="overflow-x-auto overscroll-x-contain md:flex-1">
                <FilterButtonGroup
                    value={filter}
                    onChange={(value) => onFilterChange(value as FilterKey)}
                    options={filterOptions}
                    className="min-w-max w-full"
                />
            </div>
        </div>
    )
}

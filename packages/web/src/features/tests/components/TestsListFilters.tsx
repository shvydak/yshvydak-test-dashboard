import {Play} from 'lucide-react'
import {RefObject} from 'react'
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
    filteredCount?: number
    onExpandAll?: () => void
    onCollapseAll?: () => void
    searchInputRef?: RefObject<HTMLInputElement>
    activeProject?: string
}

export function TestsListFilters({
    filter,
    onFilterChange,
    counts,
    searchQuery,
    onSearchChange,
    filteredCount,
    searchInputRef,
    activeProject,
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
                <div className="relative inline-flex shrink-0 group/noproject">
                    <Button
                        variant="primary"
                        loading={isRunningAllTests}
                        disabled={isAnyTestRunning || !activeProject}
                        onClick={() => runAllTests(activeProject || undefined)}>
                        {isRunningAllTests ? (
                            'Running...'
                        ) : (
                            <span className="flex items-center gap-1.5">
                                <Play className="h-3.5 w-3.5" />
                                <span>Run All</span>
                            </span>
                        )}
                    </Button>
                    {!activeProject && (
                        <span className="pointer-events-none absolute top-full left-0 z-50 mt-3 whitespace-nowrap rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white opacity-0 shadow-xl shadow-primary-900/30 transition-opacity group-hover/noproject:opacity-100 dark:bg-primary-500">
                            Select a project tab to run tests
                            <span className="absolute -top-1.5 left-4 h-3 w-3 rotate-45 bg-primary-600 dark:bg-primary-500" />
                        </span>
                    )}
                </div>

                <SearchInput
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    onClear={() => onSearchChange('')}
                    placeholder="Search tests..."
                    className="flex-1 md:w-96 md:flex-none"
                    showShortcutHint
                    resultCount={searchQuery ? filteredCount : undefined}
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

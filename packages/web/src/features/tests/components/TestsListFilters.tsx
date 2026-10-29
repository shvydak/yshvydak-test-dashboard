import {Play, ChevronDown, Search, Square} from 'lucide-react'
import {RefObject, useRef, useState} from 'react'
import {FilterButtonGroup, SearchInput, Button, ConfirmationDialog} from '@shared/components'
import {FilterKey, FILTER_OPTIONS} from '../constants'
import {useTestsStore} from '../store/testsStore'
import {useClickOutside} from '@/hooks/useClickOutside'

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
    const {
        runAllTests,
        discoverTests,
        stopRun,
        clearStopError,
        stopError,
        isRunningAllTests,
        isDiscovering,
        ciStopping,
        getIsAnyTestRunning,
        getIsStoppable,
        getCIBusyReason,
    } = useTestsStore()
    const ciBusyReason = getCIBusyReason()
    const isAnyTestRunning = getIsAnyTestRunning()
    const isStoppable = getIsStoppable()
    const [showDiscoverMenu, setShowDiscoverMenu] = useState(false)
    const [showStopConfirm, setShowStopConfirm] = useState(false)
    const splitButtonRef = useRef<HTMLDivElement>(null)
    useClickOutside(splitButtonRef, showDiscoverMenu, () => setShowDiscoverMenu(false))

    const isDisabled = isAnyTestRunning || !activeProject

    const filterOptions = FILTER_OPTIONS.map((option) => ({
        ...option,
        count: counts[option.key as keyof typeof counts],
    }))

    return (
        <div className="space-y-2 md:space-y-0 md:flex md:items-center md:gap-3">
            {/* Row 1 on mobile / left part on desktop: Run All + Search */}
            <div className="flex items-center gap-2 shrink-0">
                <div
                    className="relative inline-flex shrink-0 group/noproject"
                    ref={splitButtonRef}
                    title={ciBusyReason ?? undefined}>
                    {isStoppable || ciStopping ? (
                        <Button
                            variant="danger"
                            disabled={ciStopping}
                            onClick={() => setShowStopConfirm(true)}>
                            <span className="flex items-center gap-1.5">
                                <Square className="h-3.5 w-3.5 fill-current" />
                                <span>{ciStopping ? 'Stopping...' : 'Stop'}</span>
                            </span>
                        </Button>
                    ) : (
                        <div className="inline-flex rounded-xl shadow-soft">
                            <Button
                                variant="primary"
                                loading={isRunningAllTests}
                                disabled={isDisabled}
                                onClick={() => {
                                    setShowDiscoverMenu(false)
                                    runAllTests(activeProject || undefined)
                                }}
                                className="rounded-r-none shadow-none">
                                {isRunningAllTests ? (
                                    'Running...'
                                ) : (
                                    <span className="flex items-center gap-1.5">
                                        <Play className="h-3.5 w-3.5" />
                                        <span>Run All</span>
                                    </span>
                                )}
                            </Button>
                            <Button
                                variant="primary"
                                loading={isDiscovering}
                                disabled={isDisabled}
                                onClick={() => setShowDiscoverMenu((open) => !open)}
                                aria-label="Discovery options"
                                aria-expanded={showDiscoverMenu}
                                className="rounded-l-none shadow-none border-l border-white/20 px-2 dark:border-black/20">
                                {!isDiscovering && <ChevronDown className="h-3.5 w-3.5" />}
                            </Button>
                        </div>
                    )}
                    {showDiscoverMenu && (
                        <div className="absolute top-full left-0 z-50 mt-2 min-w-[180px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-800">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowDiscoverMenu(false)
                                    discoverTests(activeProject, 'incremental')
                                }}
                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.06]">
                                <Search className="h-3.5 w-3.5" />
                                Discover Tests
                            </button>
                        </div>
                    )}
                    {stopError && (isStoppable || ciStopping) && (
                        // Next to the button, not the page-wide error card: the run goes on and Stop must stay.
                        <button
                            type="button"
                            role="alert"
                            title="Dismiss"
                            onClick={clearStopError}
                            className="absolute top-full left-0 z-40 mt-2 w-72 max-w-[80vw] rounded-xl bg-danger-600 px-3 py-2 text-left text-xs font-medium text-white shadow-xl dark:bg-danger-500">
                            {stopError}
                        </button>
                    )}
                    {!activeProject && !isStoppable && !ciStopping && (
                        <span className="pointer-events-none absolute top-full left-0 z-50 mt-3 whitespace-nowrap rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white opacity-0 shadow-xl shadow-primary-900/30 transition-opacity group-hover/noproject:opacity-100 dark:bg-primary-500">
                            Select a project tab to run tests
                            <span className="absolute -top-1.5 left-4 h-3 w-3 rotate-45 bg-primary-600 dark:bg-primary-500" />
                        </span>
                    )}
                </div>
                <ConfirmationDialog
                    isOpen={showStopConfirm}
                    title="Stop the run?"
                    description="Results of this run will be removed."
                    confirmText="Stop"
                    cancelText="Keep running"
                    variant="danger"
                    onConfirm={() => {
                        setShowStopConfirm(false)
                        stopRun()
                    }}
                    onCancel={() => setShowStopConfirm(false)}
                />

                <SearchInput
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    onClear={() => onSearchChange('')}
                    placeholder="Search tests or ticket keys..."
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

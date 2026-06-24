import {ChevronDown, Play, CheckCircle2, XCircle, SkipForward, CircleDot} from 'lucide-react'
import {useSearchParams} from 'react-router-dom'
import {ActionButton} from '@shared/components'
import {TestGroupData} from '../hooks/useTestGroups'
import {useTestsStore} from '../store/testsStore'
import {FilterKey} from '../constants'

export interface TestGroupHeaderProps {
    group: TestGroupData
    expanded: boolean
    onToggle: () => void
    filter?: FilterKey
}

export function TestGroupHeader({group, expanded, onToggle, filter}: TestGroupHeaderProps) {
    const {runningGroups, getIsAnyTestRunning, runTestsGroup} = useTestsStore()
    const [searchParams] = useSearchParams()
    const activeProject = searchParams.get('project') || ''
    const isRunning = runningGroups.has(group.filePath)
    const isAnyTestRunning = getIsAnyTestRunning()
    const noProject = !activeProject

    // When in "failed" filter, extract only failed test names
    const testNames = filter === 'failed' ? group.tests.map((t) => t.name) : undefined

    return (
        <div
            className="group/header cursor-pointer border-b border-gray-200/70 py-3 transition-colors hover:bg-gray-50 dark:border-white/[0.06] dark:hover:bg-white/[0.03] md:py-4"
            onClick={onToggle}>
            <div className="flex min-h-[32px] flex-col gap-2 px-3 sm:flex-row sm:items-center sm:justify-between sm:gap-0 md:px-6">
                <div className="flex min-w-0 items-center space-x-2 md:space-x-3">
                    <ChevronDown
                        className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform duration-200 dark:text-gray-500 ${
                            expanded ? 'rotate-0' : '-rotate-90'
                        }`}
                    />
                    <span className="truncate font-mono text-xs font-medium text-gray-900 dark:text-white md:text-sm">
                        {group.filePath}
                    </span>
                </div>
                <div className="flex items-center justify-between space-x-3 pl-5 text-sm sm:justify-end sm:space-x-4 sm:pl-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-gray-600 ring-1 ring-inset ring-gray-500/10 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-white/10">
                            {group.total} test{group.total !== 1 ? 's' : ''}
                        </span>
                        {group.passed > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-medium tabular-nums text-success-700 ring-1 ring-inset ring-success-600/15 dark:bg-success-500/10 dark:text-success-300 dark:ring-success-400/20">
                                <CheckCircle2 className="h-3 w-3" /> {group.passed}
                            </span>
                        )}
                        {group.failed > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-danger-50 px-2 py-0.5 text-[11px] font-medium tabular-nums text-danger-700 ring-1 ring-inset ring-danger-600/15 dark:bg-danger-500/10 dark:text-danger-300 dark:ring-danger-400/20">
                                <XCircle className="h-3 w-3" /> {group.failed}
                            </span>
                        )}
                        {group.skipped > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-medium tabular-nums text-warning-700 ring-1 ring-inset ring-warning-600/20 dark:bg-warning-500/10 dark:text-warning-300 dark:ring-warning-400/20">
                                <SkipForward className="h-3 w-3" /> {group.skipped}
                            </span>
                        )}
                        {group.pending > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium tabular-nums text-primary-700 ring-1 ring-inset ring-primary-600/15 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-400/20">
                                <CircleDot className="h-3 w-3" /> {group.pending}
                            </span>
                        )}
                    </div>
                    <div className="relative inline-flex shrink-0 group/noproject">
                        <ActionButton
                            size="sm"
                            variant="secondary"
                            isRunning={isRunning}
                            runningText="Running..."
                            icon={<Play className="h-3.5 w-3.5" />}
                            disabled={isAnyTestRunning || noProject}
                            onClick={(e) => {
                                e.stopPropagation()
                                if (!isAnyTestRunning && activeProject) {
                                    runTestsGroup(group.filePath, testNames, activeProject)
                                }
                            }}>
                            <span className="hidden sm:inline">Run Tests Group</span>
                            <span className="sm:hidden">Run</span>
                        </ActionButton>
                        {noProject && (
                            <span className="pointer-events-none absolute bottom-full right-0 z-50 mb-3 whitespace-nowrap rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white opacity-0 shadow-xl shadow-primary-900/30 transition-opacity group-hover/noproject:opacity-100 dark:bg-primary-500">
                                Select a project tab to run tests
                                <span className="absolute -bottom-1.5 right-4 h-3 w-3 rotate-45 bg-primary-600 dark:bg-primary-500" />
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

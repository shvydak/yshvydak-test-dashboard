import {useState, useEffect, useMemo, useRef} from 'react'
import {createPortal} from 'react-dom'
import {useSearchParams} from 'react-router-dom'
import {AlertTriangle, CircleAlert} from 'lucide-react'
import {TestResult} from '@yshvydak/core'
import {LoadingSpinner} from '@shared/components'
import {AlertBanner} from '@shared/components/molecules/AlertBanner'
import {ConfirmationDialog} from '@shared/components/molecules/ConfirmationDialog'
import {useTestsStore} from '../store/testsStore'
import {useTestFilters, useTestLink} from '../hooks'
import {useTestStatusCounts} from '../hooks/useTestStatusCounts'
import {useFilteredTestsByStatus} from '../hooks/useFilteredTestsByStatus'
import {FilterKey, FILTER_OPTIONS} from '../constants'
// import {TestsListHeader} from './TestsListHeader'
import {TestsListFilters} from './TestsListFilters'
import {TestsContent} from './TestsContent'
import {TicketSearchContext} from './TicketSearchContext'
import {JiraTicketInfoContext} from './JiraTicketInfoContext'
import {useJiraSettings} from '@features/dashboard/hooks/useJiraSettings'
import {useJiraTicketInfo} from '../hooks/useJiraTicketInfo'
import {getTestJiraKeys} from '../utils/jiraTags'
import {TestDetailModal} from './testDetail'
import {TestLinkBanner} from './TestLinkBanner'
import type {TestLinkFailure} from '../hooks/useTestLink'

export interface TestsListProps {
    onTestSelect: (test: TestResult) => void
    onTestRerun: (testId: string) => void
    selectedTest: TestResult | null
    loading: boolean
    activeProject?: string
}

export default function TestsList({
    onTestSelect,
    onTestRerun,
    selectedTest,
    loading,
    activeProject,
}: TestsListProps) {
    const {
        tests,
        error: storeError,
        actionError,
        clearActionError,
        testsProject,
        listProject,
    } = useTestsStore()
    const [searchParams, setSearchParams] = useSearchParams()
    const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '')
    const [detailModalOpen, setDetailModalOpen] = useState(false)
    const [detailModalTest, setDetailModalTest] = useState<TestResult | null>(null)
    const [linkFailure, setLinkFailure] = useState<TestLinkFailure | null>(null)
    // An unsaved note draft in the open modal; a link to another test asks before replacing it
    const noteDirtyRef = useRef(false)
    const [pendingLinkTest, setPendingLinkTest] = useState<TestResult | null>(null)

    // Initialize filter from URL or default to 'all'
    const getInitialFilter = (): FilterKey => {
        const filterParam = searchParams.get('filter')
        if (filterParam) {
            const validFilter = FILTER_OPTIONS.find((opt) => opt.key === filterParam)
            if (validFilter) {
                return validFilter.key as FilterKey
            }
        }
        return 'all'
    }

    const [filter, setFilter] = useState<FilterKey>(getInitialFilter)

    // For a real status-bar filter (not 'all'), resolve the list from the server
    // rather than the store's `tests` array: that array is capped at 200 rows
    // without a project selected (5000 with one), ordered by recency, so a match
    // outside that window would show 0 results here even though the status-counts
    // badge below (an unlimited aggregate) reports the true count.
    const {
        tests: filteredByStatusTests,
        isLoading: filteredByStatusLoading,
        error: filteredByStatusError,
    } = useFilteredTestsByStatus(filter, activeProject || undefined)

    // The load that feeds the visible list: the store for 'all', the status query otherwise
    const error = filter === 'all' ? storeError : (filteredByStatusError?.message ?? null)
    const hasRowsForView =
        filter === 'all'
            ? tests.length > 0 && testsProject === listProject
            : filteredByStatusTests.length > 0

    // A refresh error dismissed by the user stays hidden until a load succeeds (error back to null)
    const [dismissedError, setDismissedError] = useState<string | null>(null)
    useEffect(() => {
        if (!error) setDismissedError(null)
    }, [error])

    const {settings: jiraSettings} = useJiraSettings(false)

    const {filteredTests} = useTestFilters({
        tests: filter === 'all' ? tests : filteredByStatusTests,
        filter,
        searchQuery,
        projectFilter: activeProject || undefined,
        tagMode: jiraSettings.tagMode,
    })

    // Badge counts come from a dedicated, unlimited server-side aggregate rather than
    // the (paginated) `tests` array — otherwise "All" caps at the list's page size
    // (200 with no project selected, 5000 with one) instead of the true total.
    const {counts: statusCounts} = useTestStatusCounts(activeProject || undefined)

    // Union of ticket-key tags across the currently visible tests. Feeds one batched lookup
    // instead of one request per chip; a key with no Jira data yet (disabled/never synced/failed)
    // is simply absent from the map, and chips fall back to the plain link.
    const ticketKeys = useMemo(() => {
        const keys = new Set<string>()
        for (const test of filteredTests) {
            for (const key of getTestJiraKeys(test)) keys.add(key)
        }
        return Array.from(keys)
    }, [filteredTests])
    const {ticketInfo} = useJiraTicketInfo(ticketKeys)
    const counts = {
        all: statusCounts.total,
        passed: statusCounts.passed,
        failed: statusCounts.failed,
        skipped: statusCounts.skipped,
        pending: statusCounts.pending,
        noted: statusCounts.noted,
    }

    // Sync filter with URL parameter changes
    useEffect(() => {
        const filterParam = searchParams.get('filter')
        const validFilter = FILTER_OPTIONS.find((opt) => opt.key === filterParam)

        if (validFilter && validFilter.key !== filter) {
            setFilter(validFilter.key as FilterKey)
        } else if (!filterParam && filter !== 'all') {
            setFilter('all')
        }
    }, [searchParams, filter])

    const showLinkedTest = (test: TestResult) => {
        if (test.project && test.project !== searchParams.get('project')) {
            const params = new URLSearchParams(searchParams)
            params.set('project', test.project)
            setSearchParams(params, {replace: true})
        }
        setDetailModalTest(test)
        setDetailModalOpen(true)
        onTestSelect(test)
    }

    // Keep editing: put the URL back on the test whose draft is open (it resolves to the same test)
    const keepCurrentTest = () => {
        setPendingLinkTest(null)
        if (!detailModalTest) return
        const params = new URLSearchParams(searchParams)
        params.set('testId', detailModalTest.testId)
        if (detailModalTest.project) params.set('project', detailModalTest.project)
        setSearchParams(params, {replace: true})
    }

    const discardAndShowLinkedTest = () => {
        const test = pendingLinkTest
        setPendingLinkTest(null)
        if (test) showLinkedTest(test)
    }

    // Deep link: open the modal for ?testId=. A test in the loaded list opens at once; otherwise
    // the server resolves it (any project) and the project tab follows the test.
    useTestLink({
        testId: searchParams.get('testId'),
        wait: loading,
        findLocal: (testId) =>
            tests.find(
                (t) => t.testId === testId && (!activeProject || t.project === activeProject)
            ),
        onResolved: (test) => {
            setLinkFailure(null)
            if (
                noteDirtyRef.current &&
                detailModalOpen &&
                detailModalTest &&
                detailModalTest.testId !== test.testId
            ) {
                setPendingLinkTest(test)
                return
            }
            showLinkedTest(test)
        },
        onFailed: (reason) => {
            setLinkFailure(reason)
            // Not found: the link is dead. Error: keep it so a reload retries.
            if (reason === 'not-found') {
                const params = new URLSearchParams(searchParams)
                params.delete('testId')
                setSearchParams(params, {replace: true})
            }
        },
    })

    const openTestDetail = (test: TestResult) => {
        setDetailModalTest(test)
        setDetailModalOpen(true)
        onTestSelect(test)

        // Update URL with testId while preserving filter
        const params = new URLSearchParams(searchParams)
        params.set('testId', test.testId)
        setSearchParams(params, {replace: false})
    }

    const closeTestDetail = () => {
        setDetailModalOpen(false)
        setDetailModalTest(null)

        // Remove testId from URL while preserving filter
        const params = new URLSearchParams(searchParams)
        params.delete('testId')
        setSearchParams(params, {replace: false})
    }

    if (loading && tests.length === 0) {
        return (
            <div className="space-y-6 animate-fade-in">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                        Tests
                    </h1>
                </div>

                <div className="rounded-2xl border border-gray-200/80 bg-white shadow-card dark:border-white/[0.07] dark:bg-gray-800/70 dark:backdrop-blur-xl">
                    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
                        <LoadingSpinner size="lg" className="mb-4" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">Loading tests...</p>
                    </div>
                </div>
            </div>
        )
    }

    // No rows of this view to show (none yet, or still the previous tab's): the full-page card.
    // Rows of this view + a failed refresh only get a banner (below)
    if (error && !hasRowsForView) {
        return (
            <div className="space-y-6 animate-fade-in">
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                    Tests
                </h1>

                <div className="rounded-2xl border border-danger-600/15 bg-danger-50 p-5 shadow-card dark:border-danger-400/20 dark:bg-danger-500/10">
                    <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-danger-100 dark:bg-danger-500/15">
                            <AlertTriangle className="h-5 w-5 text-danger-600 dark:text-danger-400" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-danger-700 dark:text-danger-300">
                                Error loading tests
                            </h3>
                            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-danger-600 dark:text-danger-400">
                                {error}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    const handleFilterChange = (newFilter: FilterKey) => {
        setFilter(newFilter)

        const params = new URLSearchParams(searchParams)
        if (newFilter === 'all') {
            params.delete('filter')
        } else {
            params.set('filter', newFilter)
        }
        setSearchParams(params, {replace: true})
    }

    const handleSearchChange = (query: string) => {
        setSearchQuery(query)
        const params = new URLSearchParams(searchParams)
        if (query) {
            params.set('q', query)
        } else {
            params.delete('q')
        }
        setSearchParams(params, {replace: true})
    }

    return (
        <div className="flex flex-col h-full animate-fade-in">
            {actionError &&
                // Portal above the detail modal's backdrop so the message stays readable while it is open
                createPortal(
                    <div className="fixed inset-x-3 top-3 z-[250] md:inset-x-auto md:right-4 md:w-[28rem]">
                        <AlertBanner
                            severity="danger"
                            icon={<CircleAlert className="h-4 w-4" />}
                            title="Action failed"
                            message={actionError}
                            onDismiss={clearActionError}
                        />
                    </div>,
                    document.body
                )}
            {error && error !== dismissedError && (
                <AlertBanner
                    severity="warning"
                    icon={<CircleAlert className="h-4 w-4" />}
                    title="Couldn't refresh the list"
                    message={`${error}. Retrying automatically`}
                    onDismiss={() => setDismissedError(error)}
                />
            )}
            {linkFailure && (
                <TestLinkBanner reason={linkFailure} onDismiss={() => setLinkFailure(null)} />
            )}

            {/* Filter bar — fixed at top, never scrolls */}
            <div className="py-3 md:py-4 shrink-0">
                <TestsListFilters
                    filter={filter}
                    onFilterChange={handleFilterChange}
                    counts={counts}
                    searchQuery={searchQuery}
                    onSearchChange={handleSearchChange}
                    filteredCount={filteredTests.length}
                    activeProject={activeProject}
                />
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto pb-4 md:pb-8">
                {filter !== 'all' && filteredByStatusLoading ? (
                    <div className="rounded-2xl border border-gray-200/80 bg-white shadow-card dark:border-white/[0.07] dark:bg-gray-800/70 dark:backdrop-blur-xl">
                        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
                            <LoadingSpinner size="lg" />
                        </div>
                    </div>
                ) : (
                    <TicketSearchContext.Provider value={searchQuery}>
                        <JiraTicketInfoContext.Provider value={ticketInfo}>
                            <TestsContent
                                tests={filteredTests}
                                selectedTest={selectedTest}
                                onTestSelect={openTestDetail}
                                onTestRerun={onTestRerun}
                                searchQuery={searchQuery}
                                filter={filter}
                            />
                        </JiraTicketInfoContext.Provider>
                    </TicketSearchContext.Provider>
                )}
            </div>

            <TestDetailModal
                test={detailModalTest}
                isOpen={detailModalOpen}
                onClose={closeTestDetail}
                onNoteDirtyChange={(dirty) => {
                    noteDirtyRef.current = dirty
                }}
            />

            <ConfirmationDialog
                isOpen={pendingLinkTest !== null}
                title="Discard unsaved note?"
                description="The test you have open has a note you have not saved. Opening another test will lose it."
                confirmText="Discard"
                cancelText="Keep editing"
                variant="danger"
                onConfirm={discardAndShowLinkedTest}
                onCancel={keepCurrentTest}
            />
        </div>
    )
}

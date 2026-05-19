import {useState, useEffect, useRef} from 'react'
import {useSearchParams} from 'react-router-dom'
import {AlertTriangle} from 'lucide-react'
import {TestResult} from '@yshvydak/core'
import {LoadingSpinner} from '@shared/components'
import {useTestsStore} from '../store/testsStore'
import {useTestFilters} from '../hooks'
import {FilterKey, FILTER_OPTIONS} from '../constants'
// import {TestsListHeader} from './TestsListHeader'
import {TestsListFilters} from './TestsListFilters'
import {TestsContent} from './TestsContent'
import {TestDetailModal} from './testDetail'

export interface TestsListProps {
    onTestSelect: (test: TestResult) => void
    onTestRerun: (testId: string) => void
    selectedTest: TestResult | null
    loading: boolean
}

export default function TestsList({
    onTestSelect,
    onTestRerun,
    selectedTest,
    loading,
}: TestsListProps) {
    const {tests, error} = useTestsStore()
    const [searchParams, setSearchParams] = useSearchParams()
    const [searchQuery, setSearchQuery] = useState('')
    const [detailModalOpen, setDetailModalOpen] = useState(false)
    const [detailModalTest, setDetailModalTest] = useState<TestResult | null>(null)
    const hasProcessedUrlRef = useRef(false)

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

    const {filteredTests, counts} = useTestFilters({
        tests,
        filter,
        searchQuery,
    })

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

    // Handle deep linking: open modal if testId is in URL
    useEffect(() => {
        const testId = searchParams.get('testId')

        // Only process URL parameters once when component mounts and tests are loaded
        if (testId && tests.length > 0 && !hasProcessedUrlRef.current) {
            hasProcessedUrlRef.current = true

            // Find the test by testId
            const test = tests.find((t) => t.testId === testId)

            if (test) {
                setDetailModalTest(test)
                setDetailModalOpen(true)
                onTestSelect(test)
            } else {
                // Test not found, remove testId but preserve filter
                const params = new URLSearchParams(searchParams)
                params.delete('testId')
                setSearchParams(params, {replace: true})
            }
        }

        // Reset the ref when URL changes (user navigates to different test)
        if (!testId) {
            hasProcessedUrlRef.current = false
        }
    }, [searchParams, tests, onTestSelect, setSearchParams])

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

    if (error) {
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
                            <p className="mt-1 text-sm text-danger-600 dark:text-danger-400">
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

        // Update URL with new filter
        const params = new URLSearchParams(searchParams)
        if (newFilter === 'all') {
            params.delete('filter')
        } else {
            params.set('filter', newFilter)
        }
        setSearchParams(params, {replace: true})
    }

    return (
        <div className="flex flex-col h-full animate-fade-in">
            {/* Filter bar — fixed at top, never scrolls */}
            <div className="py-3 md:py-4 shrink-0">
                <TestsListFilters
                    filter={filter}
                    onFilterChange={handleFilterChange}
                    counts={counts}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                />
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto pb-4 md:pb-8">
                <TestsContent
                    tests={filteredTests}
                    selectedTest={selectedTest}
                    onTestSelect={openTestDetail}
                    onTestRerun={onTestRerun}
                    searchQuery={searchQuery}
                    filter={filter}
                />
            </div>

            <TestDetailModal
                test={detailModalTest}
                isOpen={detailModalOpen}
                onClose={closeTestDetail}
            />
        </div>
    )
}

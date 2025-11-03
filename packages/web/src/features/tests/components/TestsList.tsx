import {useState, useEffect, useRef} from 'react'
import {useSearchParams} from 'react-router-dom'
import {TestResult} from '@yshvydak/core'
import {ViewMode, LoadingSpinner} from '@shared/components'
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
    const [viewMode, setViewMode] = useState<ViewMode>('grouped')
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
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Tests</h1>
                </div>

                <div className="card">
                    <div className="card-content">
                        <div className="text-center py-12">
                            <LoadingSpinner size="lg" className="mx-auto mb-4" />
                            <p className="text-gray-600 dark:text-gray-400">Loading tests...</p>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="space-y-6">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Tests</h1>

                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4">
                    <div className="flex">
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                                Error loading tests
                            </h3>
                            <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                                <p>{error}</p>
                            </div>
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
        <div className="space-y-6">
            {/* <TestsListHeader testsCount={filteredTests.length} /> */}
            <TestsListFilters
                filter={filter}
                onFilterChange={handleFilterChange}
                counts={counts}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
            />

            <TestsContent
                tests={filteredTests}
                viewMode={viewMode}
                selectedTest={selectedTest}
                onTestSelect={openTestDetail}
                onTestRerun={onTestRerun}
                searchQuery={searchQuery}
                filter={filter}
            />

            <TestDetailModal
                test={detailModalTest}
                isOpen={detailModalOpen}
                onClose={closeTestDetail}
            />
        </div>
    )
}

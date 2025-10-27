import {useState, useEffect, useRef} from 'react'
import {useSearchParams} from 'react-router-dom'
import {TestResult} from '@yshvydak/core'
import {ViewMode, LoadingSpinner} from '@shared/components'
import {useTestsStore} from '../store/testsStore'
import {useTestFilters} from '../hooks'
import {FilterKey} from '../constants'
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
    const {tests, error, selectExecution} = useTestsStore()
    const [searchParams, setSearchParams] = useSearchParams()
    const [filter, setFilter] = useState<FilterKey>('all')
    const [searchQuery, setSearchQuery] = useState('')
    const [viewMode, setViewMode] = useState<ViewMode>('grouped')
    const [detailModalOpen, setDetailModalOpen] = useState(false)
    const [detailModalTest, setDetailModalTest] = useState<TestResult | null>(null)
    const hasProcessedUrlRef = useRef(false)

    const {filteredTests, counts} = useTestFilters({
        tests,
        filter,
        searchQuery,
    })

    // Handle deep linking: open modal if testId is in URL
    useEffect(() => {
        const testId = searchParams.get('testId')
        const executionId = searchParams.get('executionId')

        // Only process URL parameters once when component mounts and tests are loaded
        if (testId && tests.length > 0 && !hasProcessedUrlRef.current) {
            hasProcessedUrlRef.current = true

            // Find the test by testId
            const test = tests.find((t) => t.testId === testId)

            if (test) {
                setDetailModalTest(test)
                setDetailModalOpen(true)
                onTestSelect(test)

                // If executionId is specified, select that execution
                if (executionId) {
                    selectExecution(executionId)
                }
            } else {
                // Test not found, clear URL parameters
                setSearchParams({}, {replace: true})
            }
        }

        // Reset the ref when URL changes (user navigates to different test)
        if (!testId) {
            hasProcessedUrlRef.current = false
        }
    }, [searchParams, tests, onTestSelect, selectExecution, setSearchParams])

    const openTestDetail = (test: TestResult) => {
        setDetailModalTest(test)
        setDetailModalOpen(true)
        onTestSelect(test)

        // Update URL with testId and executionId
        const params = new URLSearchParams()
        params.set('testId', test.testId)
        params.set('executionId', test.id)
        setSearchParams(params, {replace: false})
    }

    const closeTestDetail = () => {
        setDetailModalOpen(false)
        setDetailModalTest(null)

        // Clear URL parameters when closing modal
        setSearchParams({}, {replace: false})
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

    return (
        <div className="space-y-6">
            {/* <TestsListHeader testsCount={filteredTests.length} /> */}
            <TestsListFilters
                filter={filter}
                onFilterChange={setFilter}
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

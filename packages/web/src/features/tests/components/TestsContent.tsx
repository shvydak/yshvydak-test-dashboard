import {TestResult} from '@yshvydak/core'
import {ViewMode} from '@shared/components'
import {TestsGroupedView} from './TestsGroupedView'
import {TestsTableView} from './TestsTableView'
import {FilterKey} from '../constants'

export interface TestsContentProps {
    tests: TestResult[]
    viewMode: ViewMode
    selectedTest: TestResult | null
    onTestSelect: (test: TestResult) => void
    onTestRerun: (testId: string) => void
    searchQuery?: string
    filter?: FilterKey
}

export function TestsContent({
    tests,
    viewMode,
    selectedTest,
    onTestSelect,
    onTestRerun,
    searchQuery,
    filter,
}: TestsContentProps) {
    if (tests.length === 0) {
        return (
            <div className="card">
                <div className="card-content">
                    <div className="text-center py-12">
                        <p className="text-gray-500 dark:text-gray-400">
                            No tests found
                            {searchQuery && ` matching "${searchQuery}"`}
                            {filter && filter !== 'all' && ` with status: ${filter}`}
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    return viewMode === 'grouped' ? (
        <TestsGroupedView
            tests={tests}
            selectedTest={selectedTest}
            onTestSelect={onTestSelect}
            onTestRerun={onTestRerun}
            filter={filter}
        />
    ) : (
        <TestsTableView
            tests={tests}
            selectedTest={selectedTest}
            onTestSelect={onTestSelect}
            onTestRerun={onTestRerun}
        />
    )
}

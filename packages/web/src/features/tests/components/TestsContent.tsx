import {TestResult} from '@yshvydak/core'
import {ViewMode} from '@shared/components'
import {TestsGroupedView} from './TestsGroupedView'
import {TestsTableView} from './TestsTableView'

export interface TestsContentProps {
    tests: TestResult[]
    viewMode: ViewMode
    selectedTest: TestResult | null
    onTestSelect: (test: TestResult) => void
    onTestRerun: (testId: string) => void
    searchQuery?: string
    filter?: string
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

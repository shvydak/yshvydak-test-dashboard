import {TestResult} from '@yshvydak/core'
import {TestsGroupedView} from './TestsGroupedView'
import {FilterKey} from '../constants'

export interface TestsContentProps {
    tests: TestResult[]
    selectedTest: TestResult | null
    onTestSelect: (test: TestResult) => void
    onTestRerun: (testId: string) => void
    searchQuery?: string
    filter?: FilterKey
}

export function TestsContent({
    tests,
    selectedTest,
    onTestSelect,
    onTestRerun,
    searchQuery,
    filter,
}: TestsContentProps) {
    if (tests.length === 0) {
        return (
            <div className="rounded-2xl border border-gray-200/80 bg-white shadow-card dark:border-white/[0.07] dark:bg-gray-800/70 dark:backdrop-blur-xl">
                <div className="flex flex-col items-center justify-center px-6 py-20 text-center animate-fade-in">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-2xl dark:bg-white/[0.04]">
                        🔍
                    </div>
                    <h3 className="mt-4 text-base font-semibold tracking-tight text-gray-900 dark:text-white">
                        No tests found
                    </h3>
                    <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
                        {searchQuery && (
                            <>
                                Nothing matches{' '}
                                <span className="font-mono text-gray-600 dark:text-gray-300">
                                    “{searchQuery}”
                                </span>
                            </>
                        )}
                        {!searchQuery &&
                            filter &&
                            filter !== 'all' &&
                            `No tests with status: ${filter}`}
                        {!searchQuery &&
                            (!filter || filter === 'all') &&
                            'There are no tests to display yet.'}
                        {searchQuery && filter && filter !== 'all' && ` with status: ${filter}`}
                    </p>
                </div>
            </div>
        )
    }

    return (
        <TestsGroupedView
            tests={tests}
            selectedTest={selectedTest}
            onTestSelect={onTestSelect}
            onTestRerun={onTestRerun}
            filter={filter}
        />
    )
}

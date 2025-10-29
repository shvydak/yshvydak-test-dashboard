import {TestResult} from '@yshvydak/core'
import {useTestGroups} from '../hooks'
import {TestGroup} from './TestGroup'
import {FilterKey} from '../constants'

export interface TestsGroupedViewProps {
    tests: TestResult[]
    selectedTest: TestResult | null
    onTestSelect: (test: TestResult) => void
    onTestRerun: (testId: string) => void
    filter?: FilterKey
}

export function TestsGroupedView({
    tests,
    selectedTest,
    onTestSelect,
    onTestRerun,
    filter,
}: TestsGroupedViewProps) {
    const groupStats = useTestGroups(tests)

    return (
        <div className="space-y-4">
            {groupStats.map((group) => (
                <TestGroup
                    key={group.filePath}
                    group={group}
                    selectedTest={selectedTest}
                    onTestSelect={onTestSelect}
                    onTestRerun={onTestRerun}
                    filter={filter}
                />
            ))}
        </div>
    )
}

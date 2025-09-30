import {TestResult} from '@yshvydak/core'
import {useTestGroups} from '../hooks'
import {TestGroup} from './TestGroup'

export interface TestsGroupedViewProps {
    tests: TestResult[]
    selectedTest: TestResult | null
    onTestSelect: (test: TestResult) => void
    onTestRerun: (testId: string) => void
}

export function TestsGroupedView({
    tests,
    selectedTest,
    onTestSelect,
    onTestRerun,
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
                />
            ))}
        </div>
    )
}

import {useState} from 'react'
import {TestResult} from '@yshvydak/core'
import {Card} from '@shared/components'
import {TestGroupData} from '../hooks/useTestGroups'
import {TestGroupHeader} from './TestGroupHeader'
import {TestsTable} from './TestsTable'

export interface TestGroupProps {
    group: TestGroupData
    selectedTest: TestResult | null
    onTestSelect: (test: TestResult) => void
    onTestRerun: (testId: string) => void
}

export function TestGroup({group, selectedTest, onTestSelect, onTestRerun}: TestGroupProps) {
    const [expanded, setExpanded] = useState(true)

    return (
        <Card padding="none">
            <TestGroupHeader
                group={group}
                expanded={expanded}
                onToggle={() => setExpanded(!expanded)}
            />

            {expanded && (
                <TestsTable
                    tests={group.tests}
                    selectedTest={selectedTest}
                    onTestSelect={onTestSelect}
                    onTestRerun={onTestRerun}
                />
            )}
        </Card>
    )
}

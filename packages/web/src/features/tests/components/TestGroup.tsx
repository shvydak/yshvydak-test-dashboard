import {useState} from 'react'
import {TestResult} from '@yshvydak/core'
import {Card} from '@shared/components'
import {TestGroupData} from '../hooks/useTestGroups'
import {TestGroupHeader} from './TestGroupHeader'
import {TestsTable} from './TestsTable'
import {FilterKey} from '../constants'

export interface TestGroupProps {
    group: TestGroupData
    selectedTest: TestResult | null
    onTestSelect: (test: TestResult) => void
    onTestRerun: (testId: string) => void
    filter?: FilterKey
}

export function TestGroup({
    group,
    selectedTest,
    onTestSelect,
    onTestRerun,
    filter,
}: TestGroupProps) {
    const [expanded, setExpanded] = useState(true)

    return (
        <Card padding="none">
            <TestGroupHeader
                group={group}
                expanded={expanded}
                onToggle={() => setExpanded(!expanded)}
                filter={filter}
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

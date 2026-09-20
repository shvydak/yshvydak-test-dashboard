import {TestResult} from '@yshvydak/core'
import {useJiraSettings} from '@features/dashboard/hooks/useJiraSettings'
import {TestRow} from './TestRow'

export interface TestsTableProps {
    tests: TestResult[]
    selectedTest: TestResult | null
    onTestSelect: (test: TestResult) => void
    onTestRerun: (testId: string) => void
    showFilePath?: boolean
}

export function TestsTable({
    tests,
    selectedTest,
    onTestSelect,
    onTestRerun,
    showFilePath = false,
}: TestsTableProps) {
    // One read per table (not per row); cache is filled at App level
    const {settings} = useJiraSettings(false)
    const hasTicketColumn = settings.chipAlignment !== 'below'

    return (
        <div className="overflow-x-clip sm:overflow-x-auto">
            <table className="w-full">
                <thead>
                    <tr className="border-b border-gray-200/70 bg-gray-50/80 dark:border-white/[0.06] dark:bg-white/[0.02]">
                        <th className="w-24 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 md:w-32 md:px-6">
                            Status
                        </th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 md:px-6">
                            Test Name
                        </th>
                        {hasTicketColumn && (
                            <th className="hidden w-60 px-6 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 lg:table-cell">
                                {settings.tagMode === 'all' ? 'Tags' : 'Tickets'}
                            </th>
                        )}
                        {showFilePath && (
                            <th className="hidden px-6 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 lg:table-cell">
                                File Path
                            </th>
                        )}
                        <th className="hidden w-24 px-6 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 sm:table-cell">
                            Duration
                        </th>
                        <th className="hidden w-48 px-6 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 lg:table-cell">
                            Last Run
                        </th>
                        <th className="hidden w-20 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 sm:table-cell md:w-40 md:px-6">
                            Actions
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {tests.map((test) => (
                        <TestRow
                            key={test.id}
                            test={test}
                            selected={selectedTest?.id === test.id}
                            onSelect={onTestSelect}
                            onRerun={onTestRerun}
                            chipAlignment={settings.chipAlignment}
                            tagMode={settings.tagMode}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    )
}

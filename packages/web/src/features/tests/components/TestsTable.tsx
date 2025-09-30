import { TestResult } from '@yshvydak/core'
import { TestRow } from './TestRow'

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
	return (
		<div className="overflow-x-auto">
			<table className="w-full">
				<thead>
					<tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
						<th className="text-left py-3 px-6 text-xs font-medium text-gray-600 dark:text-gray-400 w-32">
							Status
						</th>
						<th className="text-left py-3 px-6 text-xs font-medium text-gray-600 dark:text-gray-400">
							Test Name
						</th>
						{showFilePath && (
							<th className="text-left py-3 px-6 text-xs font-medium text-gray-600 dark:text-gray-400">
								File Path
							</th>
						)}
						<th className="text-left py-3 px-6 text-xs font-medium text-gray-600 dark:text-gray-400 w-24">
							Duration
						</th>
						<th className="text-left py-3 px-6 text-xs font-medium text-gray-600 dark:text-gray-400 w-48">
							Last Run
						</th>
						<th className="text-left py-3 px-6 text-xs font-medium text-gray-600 dark:text-gray-400 w-40">
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
						/>
					))}
				</tbody>
			</table>
		</div>
	)
}
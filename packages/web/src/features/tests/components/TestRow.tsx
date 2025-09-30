import { TestResult } from '@yshvydak/core'
import { StatusBadge, ActionButton } from '@shared/components'
import { formatDuration, formatLastRun } from '../utils'
import { useTestsStore } from '../store/testsStore'

export interface TestRowProps {
	test: TestResult
	selected: boolean
	onSelect: (test: TestResult) => void
	onRerun: (testId: string) => void
}

export function TestRow({ test, selected, onSelect, onRerun }: TestRowProps) {
	const { runningTests, getIsAnyTestRunning } = useTestsStore()
	const isRunning = runningTests.has(test.id)
	const isAnyTestRunning = getIsAnyTestRunning()

	return (
		<tr
			className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer ${
				selected ? 'bg-primary-50 dark:bg-primary-900/20' : ''
			}`}
			onClick={() => onSelect(test)}
		>
			<td className="py-3 px-6 w-32">
				<StatusBadge status={test.status as any} />
			</td>
			<td className="py-3 px-6">
				<div className="font-medium text-gray-900 dark:text-white">
					{test.name}
				</div>
				{test.errorMessage && (
					<div className="text-xs text-red-600 dark:text-red-400 mt-1 truncate max-w-xs">
						{test.errorMessage}
					</div>
				)}
			</td>
			<td className="py-3 px-6 text-sm text-gray-600 dark:text-gray-400 w-24">
				{formatDuration(test.duration)}
			</td>
			<td className="py-3 px-6 text-sm text-gray-600 dark:text-gray-400 w-48">
				{formatLastRun(test)}
			</td>
			<td className="py-3 px-6 w-40">
				<ActionButton
					size="sm"
					variant="primary"
					isRunning={isRunning}
					runningText="Running..."
					icon="▶️"
					disabled={isAnyTestRunning}
					onClick={(e) => {
						e.stopPropagation()
						onRerun(test.id)
					}}
				>
					Run
				</ActionButton>
			</td>
		</tr>
	)
}
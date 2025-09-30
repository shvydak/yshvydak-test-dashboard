import { ActionButton } from '@shared/components'
import { TestGroupData } from '../hooks/useTestGroups'
import { useTestsStore } from '../../../store/testsStore'

export interface TestGroupHeaderProps {
	group: TestGroupData
	expanded: boolean
	onToggle: () => void
}

export function TestGroupHeader({ group, expanded, onToggle }: TestGroupHeaderProps) {
	const { runningGroups, getIsAnyTestRunning, runTestsGroup } = useTestsStore()
	const isRunning = runningGroups.has(group.filePath)
	const isAnyTestRunning = getIsAnyTestRunning()

	return (
		<div
			className="py-4 border-b border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
			onClick={onToggle}
		>
			<div className="flex items-center justify-between px-6 min-h-[32px]">
				<div className="flex items-center space-x-3">
					<span className="text-gray-400">
						{expanded ? '▼' : '▶'}
					</span>
					<span className="font-medium text-gray-900 dark:text-white font-mono text-sm">
						{group.filePath}
					</span>
				</div>
				<div
					className="flex items-center justify-end space-x-4 text-sm"
					style={{ width: '28rem' }}
				>
					<div className="flex items-center space-x-2">
						<span className="text-gray-600 dark:text-gray-400">
							{group.total} test{group.total !== 1 ? 's' : ''}
						</span>
						{group.passed > 0 && (
							<span className="text-success-600 dark:text-success-400">
								✅ {group.passed}
							</span>
						)}
						{group.failed > 0 && (
							<span className="text-danger-600 dark:text-danger-400">
								❌ {group.failed}
							</span>
						)}
						{group.skipped > 0 && (
							<span className="text-warning-600 dark:text-warning-400">
								⏭️ {group.skipped}
							</span>
						)}
						{group.pending > 0 && (
							<span className="text-blue-600 dark:text-blue-400">
								⏸️ {group.pending}
							</span>
						)}
					</div>
					<ActionButton
						size="sm"
						variant="primary"
						isRunning={isRunning}
						runningText="Running..."
						icon="▶️"
						disabled={isAnyTestRunning}
						onClick={(e) => {
							e.stopPropagation()
							if (!isAnyTestRunning) {
								runTestsGroup(group.filePath)
							}
						}}
					>
						Run Tests Group
					</ActionButton>
				</div>
			</div>
		</div>
	)
}
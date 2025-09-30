import { TestResult } from '@yshvydak/core'
import { formatErrorLines } from '../../../../utils/errorFormatter'
import { formatDuration } from '../../utils/formatters'

export interface TestOverviewTabProps {
	test: TestResult
	attachmentsCount: number
	loading: boolean
}

export function TestOverviewTab({
	test,
	attachmentsCount,
	loading,
}: TestOverviewTabProps) {
	return (
		<div className="space-y-6">
			<div className="grid grid-cols-2 gap-6">
				<div>
					<h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
						Test Details
					</h3>
					<div className="space-y-3">
						<div>
							<span className="text-xs text-gray-400">File Path:</span>
							<p className="font-mono text-sm text-gray-900 dark:text-white">
								{test.filePath}
							</p>
						</div>
						<div>
							<span className="text-xs text-gray-400">Duration:</span>
							<p className="text-sm text-gray-900 dark:text-white">
								{formatDuration(test.duration)}
							</p>
						</div>
						<div>
							<span className="text-xs text-gray-400">Run ID:</span>
							<p className="font-mono text-xs text-gray-900 dark:text-white">
								{test.runId}
							</p>
						</div>
						{test.rerunCount && test.rerunCount > 0 && (
							<div>
								<span className="text-xs text-gray-400">Rerun Count:</span>
								<p className="text-sm text-gray-900 dark:text-white">
									{test.rerunCount}
								</p>
							</div>
						)}
					</div>
				</div>
				<div>
					<h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
						Execution Summary
					</h3>
					<div className="space-y-3">
						<div>
							<span className="text-xs text-gray-400">Status:</span>
							<p className="text-sm text-gray-900 dark:text-white">
								{test.status}
							</p>
						</div>
						<div>
							<span className="text-xs text-gray-400">Attachments:</span>
							<p className="text-sm text-gray-900 dark:text-white">
								{loading ? 'Loading...' : `${attachmentsCount} file(s)`}
							</p>
						</div>
					</div>
				</div>
			</div>

			{test.errorMessage && (
				<div>
					<h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
						Errors
					</h3>
					<div className="bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-600 overflow-hidden">
						<div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 border-b border-gray-200 dark:border-gray-600">
							<span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
								Error Details
							</span>
						</div>
						<div className="p-3 max-h-64 overflow-y-auto">
							<div className="space-y-1">{formatErrorLines(test.errorMessage)}</div>
						</div>
					</div>
					<div className="flex items-center gap-3 mt-3">
						<button
							onClick={() => {
								navigator.clipboard.writeText(test.errorMessage as any)
							}}
							className="text-xs px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
						>
							📋 Copy Error
						</button>
					</div>
				</div>
			)}
		</div>
	)
}

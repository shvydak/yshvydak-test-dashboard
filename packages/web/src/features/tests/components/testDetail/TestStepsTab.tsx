import { TestResult } from '@yshvydak/core'
import { formatDuration } from '../../utils/formatters'

export interface TestStepsTabProps {
	test: TestResult
}

export function TestStepsTab({ test }: TestStepsTabProps) {
	if (!test.steps || test.steps.length === 0) {
		return (
			<div className="text-center py-8">
				<p className="text-gray-500 dark:text-gray-400">
					No test steps recorded
				</p>
			</div>
		)
	}

	return (
		<div className="space-y-4">
			<div className="space-y-3">
				{test.steps.map((step, index) => (
					<div
						key={index}
						className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
					>
						<div className="flex items-center justify-between">
							<h4 className="font-medium text-gray-900 dark:text-white">
								Step {index + 1}: {step.title}
							</h4>
							<span className="text-sm text-gray-500 dark:text-gray-400">
								{formatDuration(step.duration)}
							</span>
						</div>
						<p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
							Category: {step.category}
						</p>
						{step.error && (
							<div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
								<pre className="text-xs text-red-800 dark:text-red-200 whitespace-pre-wrap">
									{step.error}
								</pre>
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	)
}

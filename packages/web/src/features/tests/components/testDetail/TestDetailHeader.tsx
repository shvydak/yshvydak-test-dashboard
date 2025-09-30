import { StatusBadge } from '@shared/components'

export interface TestDetailHeaderProps {
	testName: string
	testStatus: string
	onClose: () => void
}

export function TestDetailHeader({
	testName,
	testStatus,
	onClose,
}: TestDetailHeaderProps) {
	return (
		<div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
			<div className="flex items-center space-x-3">
				<StatusBadge status={testStatus as any} />
				<h2 className="text-xl font-semibold text-gray-900 dark:text-white">
					{testName}
				</h2>
			</div>
			<button
				onClick={onClose}
				className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
			>
				<svg
					className="w-6 h-6"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
			</button>
		</div>
	)
}

import { SearchInput } from '@shared/components'

export interface TestsListHeaderProps {
	testsCount: number
	searchQuery: string
	onSearchChange: (query: string) => void
}

export function TestsListHeader({
	testsCount,
	searchQuery,
	onSearchChange,
}: TestsListHeaderProps) {
	return (
		<div className="flex items-center justify-between">
			<div>
				<h1 className="text-3xl font-bold text-gray-900 dark:text-white">
					Tests
				</h1>
				<p className="mt-2 text-gray-600 dark:text-gray-400">
					{testsCount} test{testsCount !== 1 ? 's' : ''} found
				</p>
			</div>

			<div className="relative">
				<SearchInput
					value={searchQuery}
					onChange={(e) => onSearchChange(e.target.value)}
					placeholder="Search tests..."
					className="w-64"
				/>
			</div>
		</div>
	)
}
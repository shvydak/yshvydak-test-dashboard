import { TestResult } from '@yshvydak/core'
import StatsCard from './StatsCard'
import { DashboardStats as DashboardStatsType } from '../hooks/useDashboardStats'

export interface DashboardStatsProps {
	stats?: DashboardStatsType
	tests: TestResult[]
	loading: boolean
}

export function DashboardStats({ stats, tests, loading }: DashboardStatsProps) {
	const fallbackStats = {
		totalTests: tests.length,
		passedTests: tests.filter((t) => t.status === 'passed').length,
		failedTests: tests.filter((t) => t.status === 'failed').length,
		skippedTests: tests.filter((t) => t.status === 'skipped').length,
		successRate:
			tests.length > 0
				? (tests.filter((t) => t.status === 'passed').length / tests.length) * 100
				: 0,
		totalRuns: 0,
		recentRuns: [],
	}

	const displayStats = stats || fallbackStats

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
			<StatsCard
				title="Total Tests"
				value={displayStats.totalTests}
				icon="📊"
				loading={loading}
			/>
			<StatsCard
				title="Passed"
				value={displayStats.passedTests}
				icon="✅"
				className="text-success-600 dark:text-success-400"
				loading={loading}
			/>
			<StatsCard
				title="Failed"
				value={displayStats.failedTests}
				icon="❌"
				className="text-danger-600 dark:text-danger-400"
				loading={loading}
			/>
			<StatsCard
				title="Success Rate"
				value={`${Math.round(displayStats.successRate)}%`}
				icon="📈"
				className={
					displayStats.successRate >= 80
						? 'text-success-600 dark:text-success-400'
						: 'text-danger-600 dark:text-danger-400'
				}
				loading={loading}
			/>
		</div>
	)
}
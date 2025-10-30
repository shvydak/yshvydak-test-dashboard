import {TestResult} from '@yshvydak/core'
import {useNavigate} from 'react-router-dom'
import StatsCard from './StatsCard'
import {DashboardStats as DashboardStatsType} from '../hooks/useDashboardStats'

export interface DashboardStatsProps {
    stats?: DashboardStatsType
    tests: TestResult[]
    loading: boolean
}

export function DashboardStats({stats, tests, loading}: DashboardStatsProps) {
    const navigate = useNavigate()

    const fallbackStats = {
        totalTests: tests.length,
        passedTests: tests.filter((t) => t.status === 'passed').length,
        failedTests: tests.filter((t) => t.status === 'failed').length,
        skippedTests: tests.filter((t) => t.status === 'skipped').length,
        successRate: (() => {
            // Success rate should only consider completed tests (passed + failed)
            // Exclude pending and skipped tests
            const completedTests = tests.filter(
                (t) => t.status === 'passed' || t.status === 'failed'
            )
            const passedTests = tests.filter((t) => t.status === 'passed')

            return completedTests.length > 0
                ? (passedTests.length / completedTests.length) * 100
                : 0
        })(),
        totalRuns: 0,
        recentRuns: [],
    }

    const displayStats = stats || fallbackStats

    const handleStatsClick = (filter: string) => {
        navigate(`/tests?filter=${filter}`)
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatsCard
                title={`Total Tests (not include "skipped" status)`}
                value={displayStats.totalTests - displayStats.skippedTests}
                icon="📊"
                loading={loading}
                onClick={() => handleStatsClick('all')}
            />
            <StatsCard
                title="Passed"
                value={displayStats.passedTests}
                icon="✅"
                className="text-success-600 dark:text-success-400"
                loading={loading}
                onClick={() => handleStatsClick('passed')}
            />
            <StatsCard
                title="Failed"
                value={displayStats.failedTests}
                icon="❌"
                className="text-danger-600 dark:text-danger-400"
                loading={loading}
                onClick={() => handleStatsClick('failed')}
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

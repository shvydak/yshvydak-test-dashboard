import {useNavigate} from 'react-router-dom'
import {LayoutGrid, CheckCircle2, XCircle, TrendingUp} from 'lucide-react'
import StatsCard from './StatsCard'
import {TestStatusCounts} from '@features/tests/hooks/useTestStatusCounts'

export interface DashboardStatsProps {
    counts: TestStatusCounts
    loading: boolean
}

export function DashboardStats({counts, loading}: DashboardStatsProps) {
    const navigate = useNavigate()

    // Success rate should only consider completed tests (passed + failed) —
    // pending and skipped are excluded from the denominator.
    const completedTests = counts.passed + counts.failed
    const successRate = completedTests > 0 ? (counts.passed / completedTests) * 100 : 0

    const handleStatsClick = (filter: string) => {
        navigate(`/tests?filter=${filter}`)
    }

    return (
        <div className="stagger grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
            <StatsCard
                title={`Total Tests`}
                value={counts.total - counts.skipped}
                icon={<LayoutGrid className="h-5 w-5 text-gray-500 dark:text-gray-400" />}
                loading={loading}
                onClick={() => handleStatsClick('all')}
            />
            <StatsCard
                title="Passed"
                value={counts.passed}
                icon={<CheckCircle2 className="h-5 w-5 text-success-500 dark:text-success-400" />}
                className="text-success-600 dark:text-success-400"
                loading={loading}
                onClick={() => handleStatsClick('passed')}
            />
            <StatsCard
                title="Failed"
                value={counts.failed}
                icon={<XCircle className="h-5 w-5 text-danger-500 dark:text-danger-400" />}
                className="text-danger-600 dark:text-danger-400"
                loading={loading}
                onClick={() => handleStatsClick('failed')}
            />
            <StatsCard
                title="Success Rate"
                value={`${Math.round(successRate)}%`}
                icon={
                    <TrendingUp
                        className={`h-5 w-5 ${
                            successRate >= 80
                                ? 'text-success-500 dark:text-success-400'
                                : 'text-danger-500 dark:text-danger-400'
                        }`}
                    />
                }
                className={
                    successRate >= 80
                        ? 'text-success-600 dark:text-success-400'
                        : 'text-danger-600 dark:text-danger-400'
                }
                loading={loading}
            />
        </div>
    )
}

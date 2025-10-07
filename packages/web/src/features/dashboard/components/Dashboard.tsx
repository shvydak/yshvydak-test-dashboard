import {useEffect} from 'react'
import {useTestsStore} from '@features/tests/store/testsStore'
import {useDashboardStats} from '../hooks'
import {DashboardStats} from './DashboardStats'
import {SystemInfo} from './SystemInfo'
import RecentTests from './RecentTests'
import ErrorsOverview from './ErrorsOverview'

export default function Dashboard() {
    const {tests, fetchTests, lastUpdated} = useTestsStore()

    const {data: stats, isLoading: statsLoading, error: statsError} = useDashboardStats()

    useEffect(() => {
        if (tests.length === 0) {
            fetchTests()
        }
    }, [tests.length, fetchTests])

    if (statsError) {
        return (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4">
                <div className="flex">
                    <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                            Error loading dashboard
                        </h3>
                        <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                            <p>{statsError.message}</p>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">
                        Test execution overview and statistics
                    </p>
                </div>

                {lastUpdated && (
                    <div className="text-right">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Last updated</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {lastUpdated.toLocaleTimeString()}
                        </p>
                    </div>
                )}
            </div>

            {/* Stats Grid */}
            <DashboardStats stats={stats} tests={tests} loading={statsLoading} />

            {/* Recent Tests */}
            <RecentTests tests={tests.slice(0, 5)} />

            {/* Errors Overview */}
            <ErrorsOverview tests={tests} />

            {/* System Information */}
            <SystemInfo />
        </div>
    )
}

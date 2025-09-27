import {useEffect, useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {useTestsStore} from '../store/testsStore'
import StatsCard from './StatsCard'
import RecentTests from './RecentTests'
import ErrorsOverview from './ErrorsOverview'
import {config} from '../config/environment.config'
import {authFetch} from '../utils/authFetch'

interface DashboardStats {
    totalTests: number
    passedTests: number
    failedTests: number
    skippedTests: number
    successRate: number
    totalRuns: number
    recentRuns: any[]
}

async function fetchDashboardStats(): Promise<DashboardStats> {
    const response = await authFetch(`${config.api.baseUrl}/runs/stats`)
    if (!response.ok) {
        throw new Error('Failed to fetch dashboard stats')
    }
    const result = await response.json()
    return result.data
}

export default function Dashboard() {
    const {
        tests,
        fetchTests,
        lastUpdated,
        discoverTests,
        runAllTests,
        isDiscovering,
        isRunningAllTests,
        getIsAnyTestRunning,
        setRunningAllTests,
    } = useTestsStore()
    const isAnyTestRunning = getIsAnyTestRunning()
    const [clearingData, setClearingData] = useState(false)
    const [forceResetting, setForceResetting] = useState(false)

    const {
        data: stats,
        isLoading: statsLoading,
        error: statsError,
        refetch: refetchStats,
    } = useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: fetchDashboardStats,
        refetchInterval: 30000, // Обновляем каждые 30 секунд
    })

    const forceResetProcesses = async () => {
        try {
            setForceResetting(true)
            const response = await fetch(
                `${config.api.baseUrl}/tests/force-reset`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                },
            )

            if (!response.ok) {
                throw new Error('Failed to force reset processes')
            }

            const result = await response.json()

            // Refresh state
            fetchTests()
            setRunningAllTests(false)
        } catch (error) {
            alert(
                'Failed to force reset processes: ' + (error as Error).message,
            )
        } finally {
            setForceResetting(false)
        }
    }

    const clearAllData = async () => {
        if (
            !confirm(
                '⚠️ Are you sure you want to clear ALL test data? This action cannot be undone.',
            )
        ) {
            return
        }

        setClearingData(true)
        try {
            const response = await authFetch(`${config.api.baseUrl}/tests/all`, {
                method: 'DELETE',
            })

            if (!response.ok) {
                throw new Error('Failed to clear data')
            }

            const result = await response.json()
            const statsBefore = result.statsBefore || {}
            const totalRuns = statsBefore.total_runs || 0
            const totalResults = statsBefore.total_results || 0
            const totalAttachments = statsBefore.total_attachments || 0

            alert(
                `✅ Success! Cleared ${totalRuns} runs, ${totalResults} results, ${totalAttachments} attachments`,
            )

            // Refresh data
            fetchTests()
            refetchStats()
        } catch (error) {
            alert(
                '❌ Failed to clear data: ' +
                    (error instanceof Error ? error.message : 'Unknown error'),
            )
        } finally {
            setClearingData(false)
        }
    }

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

    // Вычисляем статистику из загруженных тестов если API не работает
    const fallbackStats = {
        totalTests: tests.length,
        passedTests: tests.filter((t) => t.status === 'passed').length,
        failedTests: tests.filter((t) => t.status === 'failed').length,
        skippedTests: tests.filter((t) => t.status === 'skipped').length,
        successRate:
            tests.length > 0
                ? (tests.filter((t) => t.status === 'passed').length /
                      tests.length) *
                  100
                : 0,
        totalRuns: 0,
        recentRuns: [],
    }

    const displayStats = stats || fallbackStats

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Dashboard
                    </h1>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">
                        Test execution overview and statistics
                    </p>
                </div>

                {lastUpdated && (
                    <div className="text-right">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Last updated
                        </p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {lastUpdated.toLocaleTimeString()}
                        </p>
                    </div>
                )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatsCard
                    title="Total Tests"
                    value={displayStats.totalTests}
                    icon="📊"
                    loading={statsLoading}
                />
                <StatsCard
                    title="Passed"
                    value={displayStats.passedTests}
                    icon="✅"
                    className="text-success-600 dark:text-success-400"
                    loading={statsLoading}
                />
                <StatsCard
                    title="Failed"
                    value={displayStats.failedTests}
                    icon="❌"
                    className="text-danger-600 dark:text-danger-400"
                    loading={statsLoading}
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
                    loading={statsLoading}
                />
            </div>

            {/* Recent Tests */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <RecentTests tests={tests.slice(0, 5)} />

                {/* Quick Actions */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">Quick Actions</h3>
                        <p className="card-description">
                            Common tasks and operations
                        </p>
                    </div>
                    <div className="card-content space-y-3">
                        <button
                            className={`w-full px-4 py-2 rounded-md transition-colors ${
                                isAnyTestRunning
                                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                    : 'bg-primary-600 text-white hover:bg-primary-700'
                            }`}
                            onClick={discoverTests}
                            disabled={isAnyTestRunning}>
                            {isDiscovering
                                ? '🔄 Discovering...'
                                : '🔍 Discover Tests'}
                        </button>
                        <button
                            className={`w-full px-4 py-2 rounded-md transition-colors ${
                                isAnyTestRunning
                                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                    : 'bg-gray-600 text-white hover:bg-gray-700'
                            }`}
                            onClick={runAllTests}
                            disabled={isAnyTestRunning}>
                            {isRunningAllTests
                                ? '🔄 Running...'
                                : '▶️ Run All Tests'}
                        </button>
                        <button
                            className={`w-full px-4 py-2 rounded-md transition-colors ${
                                isAnyTestRunning
                                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                    : 'bg-gray-600 text-white hover:bg-gray-700'
                            }`}
                            onClick={() => fetchTests()}
                            disabled={isAnyTestRunning}>
                            🔄 Refresh Tests
                        </button>
                        <button
                            className="btn-secondary w-full"
                            onClick={() =>
                                window.open(
                                    `${config.api.baseUrl}/health`,
                                    '_blank',
                                )
                            }>
                            🩺 Check API Health
                        </button>
                        <button
                            className="btn-secondary w-full"
                            onClick={() => window.location.reload()}>
                            ♻️ Reload Dashboard
                        </button>
                        {/* Debug/Emergency Actions */}
                        {isRunningAllTests && (
                            <>
                                <button
                                    className="w-full px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
                                    onClick={() => setRunningAllTests(false)}>
                                    🔧 Force Enable Buttons (Client)
                                </button>
                                <button
                                    className={`w-full px-4 py-2 rounded-md transition-colors ${
                                        forceResetting
                                            ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                            : 'bg-red-500 text-white hover:bg-red-600'
                                    }`}
                                    onClick={forceResetProcesses}
                                    disabled={forceResetting}>
                                    {forceResetting
                                        ? '🔄 Resetting...'
                                        : '🚨 Force Reset Server Processes'}
                                </button>
                            </>
                        )}
                        <button
                            className={`w-full px-4 py-2 rounded-md transition-colors ${
                                isAnyTestRunning || clearingData
                                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                    : 'bg-red-600 text-white hover:bg-red-700'
                            }`}
                            onClick={clearAllData}
                            disabled={isAnyTestRunning || clearingData}>
                            {clearingData
                                ? '🔄 Clearing...'
                                : '🗑️ Clear All Data'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Errors Overview */}
            <ErrorsOverview tests={tests} />

            {/* System Information */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">System Information</h3>
                    <p className="card-description">
                        Runtime and environment details
                    </p>
                </div>
                <div className="card-content">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                            <span className="font-medium text-gray-900 dark:text-white">
                                API Server:
                            </span>
                            <span className="ml-2 text-gray-600 dark:text-gray-400">
                                {config.api.serverUrl.replace('http://', '')}
                            </span>
                        </div>
                        <div>
                            <span className="font-medium text-gray-900 dark:text-white">
                                Frontend:
                            </span>
                            <span className="ml-2 text-gray-600 dark:text-gray-400">
                                React + Vite
                            </span>
                        </div>
                        <div>
                            <span className="font-medium text-gray-900 dark:text-white">
                                Version:
                            </span>
                            <span className="ml-2 text-gray-600 dark:text-gray-400">
                                1.0.0
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

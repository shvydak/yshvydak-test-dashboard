import {useEffect, useState, useCallback, useRef} from 'react'
import {useSearchParams} from 'react-router-dom'
import {useTestsStore} from '@features/tests/store/testsStore'
import {useDashboardStats, useFlakyTests, useTestTimeline} from '../hooks'
import {DashboardStats} from './DashboardStats'
import {AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer} from 'recharts'
import {useQueryClient} from '@tanstack/react-query'
import {useWebSocket} from '@/hooks/useWebSocket'
import {getWebSocketUrl} from '@features/authentication/utils/webSocketUrl'
import {TestDetailModal} from '@features/tests/components/testDetail'

export default function Dashboard() {
    const {tests, fetchTests, lastUpdated} = useTestsStore()
    const queryClient = useQueryClient()
    const [searchParams, setSearchParams] = useSearchParams()

    const {isLoading: statsLoading, error: statsError} = useDashboardStats()
    const {
        data: flakyTests,
        isLoading: flakyLoading,
        days,
        threshold,
        updateDays,
        updateThreshold,
    } = useFlakyTests()
    const {data: timelineData, isLoading: timelineLoading} = useTestTimeline(30)

    const [webSocketUrl, setWebSocketUrl] = useState<string | null>(null)
    const [detailModalOpen, setDetailModalOpen] = useState(false)
    const [selectedTestId, setSelectedTestId] = useState<string | null>(null)
    const hasProcessedUrlRef = useRef(false)

    useEffect(() => {
        const url = getWebSocketUrl(true)
        setWebSocketUrl(url)
    }, [])

    const handleRunCompleted = useCallback(() => {
        queryClient.invalidateQueries({queryKey: ['flaky-tests']})
        queryClient.invalidateQueries({queryKey: ['test-timeline']})
        queryClient.invalidateQueries({queryKey: ['dashboard-stats']})
        fetchTests()
    }, [queryClient, fetchTests])

    useWebSocket(webSocketUrl, {
        onRunCompleted: handleRunCompleted,
    })

    useEffect(() => {
        if (tests.length === 0) {
            fetchTests()
        }
    }, [tests.length, fetchTests])

    // Handle deep linking: open modal if testId is in URL
    useEffect(() => {
        const testId = searchParams.get('testId')

        // Only process URL parameters once when component mounts and tests are loaded
        if (testId && tests.length > 0 && !hasProcessedUrlRef.current) {
            hasProcessedUrlRef.current = true

            // Find the test by testId
            const test = tests.find((t) => t.testId === testId)

            if (test) {
                setSelectedTestId(testId)
                setDetailModalOpen(true)
            } else {
                // Test not found, clear URL parameters
                setSearchParams({}, {replace: true})
            }
        }

        // Reset the ref when URL changes (user navigates to different test)
        if (!testId) {
            hasProcessedUrlRef.current = false
        }
    }, [searchParams, tests, setSearchParams])

    const handleFlakyTestClick = (testId: string) => {
        setSelectedTestId(testId)
        setDetailModalOpen(true)

        // Update URL with testId
        const params = new URLSearchParams()
        params.set('testId', testId)
        setSearchParams(params, {replace: false})
    }

    const handleCloseModal = () => {
        setDetailModalOpen(false)
        setSelectedTestId(null)

        // Clear URL parameters when closing modal
        setSearchParams({}, {replace: false})
    }

    const selectedTest = selectedTestId ? tests.find((t) => t.testId === selectedTestId) : null

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

            <DashboardStats tests={tests} loading={statsLoading} />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Flaky Tests
                            </h2>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                Tests with intermittent failures
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-600 dark:text-gray-400">
                                    Period:
                                </label>
                                <select
                                    value={days}
                                    onChange={(e) => updateDays(parseInt(e.target.value))}
                                    className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                                    <option value="7">7 days</option>
                                    <option value="14">14 days</option>
                                    <option value="30">30 days</option>
                                    <option value="60">60 days</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-600 dark:text-gray-400">
                                    Threshold:
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="99"
                                    value={threshold}
                                    onChange={(e) => updateThreshold(parseInt(e.target.value))}
                                    className="w-16 text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                                <span className="text-xs text-gray-600 dark:text-gray-400">%</span>
                            </div>
                        </div>
                    </div>

                    {flakyLoading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <div
                                    key={i}
                                    className="h-16 bg-gray-100 dark:bg-gray-700 rounded animate-pulse"
                                />
                            ))}
                        </div>
                    ) : !flakyTests || flakyTests.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="text-4xl mb-2">🎉</div>
                            <p className="text-gray-600 dark:text-gray-400 text-sm">
                                No flaky tests detected!
                            </p>
                            <p className="text-gray-500 dark:text-gray-500 text-xs mt-1">
                                All tests are stable
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {flakyTests.map((test) => (
                                <div
                                    key={test.testId}
                                    onClick={() => handleFlakyTestClick(test.testId)}
                                    className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                                                {test.name}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                                {test.filePath}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3 flex-shrink-0">
                                            <div className="text-right">
                                                <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
                                                    {test.flakyPercentage}%
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    {test.failedRuns}/{test.totalRuns} failed
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-0.5 mt-2">
                                        {test.history.slice(-15).map((status, idx) => (
                                            <span
                                                key={idx}
                                                className="text-base"
                                                title={`Run ${idx + 1}: ${status}`}>
                                                {status === 'passed' ? '✅' : '❌'}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                    <div className="mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Test Execution Timeline
                        </h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            Last 30 days activity
                        </p>
                    </div>

                    {timelineLoading ? (
                        <div className="h-64 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
                    ) : !timelineData || timelineData.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-gray-600 dark:text-gray-400 text-sm">
                                No test data available
                            </p>
                            <p className="text-gray-500 dark:text-gray-500 text-xs mt-1">
                                Run some tests to see timeline
                            </p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={240}>
                            <AreaChart
                                data={timelineData}
                                margin={{top: 10, right: 10, left: 0, bottom: 0}}>
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    className="stroke-gray-200 dark:stroke-gray-700"
                                />
                                <XAxis
                                    dataKey="date"
                                    tick={{fontSize: 12}}
                                    className="fill-gray-600 dark:fill-gray-400"
                                    tickFormatter={(value) => {
                                        const date = new Date(value)
                                        return `${date.getMonth() + 1}/${date.getDate()}`
                                    }}
                                />
                                <YAxis
                                    tick={{fontSize: 12}}
                                    className="fill-gray-600 dark:fill-gray-400"
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'rgb(31 41 55)',
                                        border: 'none',
                                        borderRadius: '0.5rem',
                                        color: 'white',
                                    }}
                                    labelStyle={{color: 'rgb(156 163 175)'}}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="passed"
                                    stackId="1"
                                    stroke="rgb(34 197 94)"
                                    fill="rgb(34 197 94)"
                                    fillOpacity={0.6}
                                    name="Passed"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="failed"
                                    stackId="1"
                                    stroke="rgb(239 68 68)"
                                    fill="rgb(239 68 68)"
                                    fillOpacity={0.6}
                                    name="Failed"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="skipped"
                                    stackId="1"
                                    stroke="rgb(156 163 175)"
                                    fill="rgb(156 163 175)"
                                    fillOpacity={0.6}
                                    name="Skipped"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            <TestDetailModal
                test={selectedTest || null}
                isOpen={detailModalOpen}
                onClose={handleCloseModal}
            />
        </div>
    )
}

import {useEffect, useState, useCallback, useRef} from 'react'
import {AlertTriangle, PartyPopper, BarChart2} from 'lucide-react'
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
            <div className="animate-fade-in rounded-2xl border border-danger-600/15 bg-danger-50 p-5 ring-1 ring-danger-600/10 dark:border-danger-400/20 dark:bg-danger-500/10">
                <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-danger-100 dark:bg-danger-500/15">
                        <AlertTriangle className="h-5 w-5 text-danger-600 dark:text-danger-400" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-danger-700 dark:text-danger-300">
                            Error loading dashboard
                        </h3>
                        <div className="mt-1 text-sm text-danger-600/90 dark:text-danger-300/80">
                            <p>{statsError.message}</p>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                        Dashboard
                    </h1>
                    <p className="mt-1.5 text-gray-500 dark:text-gray-400">
                        Test execution overview and statistics
                    </p>
                </div>

                {lastUpdated && (
                    <div className="flex items-center gap-2 self-start rounded-full bg-gray-100/70 px-3.5 py-1.5 dark:bg-white/[0.04] sm:self-auto">
                        <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            Updated
                        </span>
                        <span className="text-xs font-semibold tabular-nums text-gray-900 dark:text-white">
                            {lastUpdated.toLocaleTimeString()}
                        </span>
                    </div>
                )}
            </div>

            <DashboardStats tests={tests} loading={statsLoading} />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-card transition-all duration-200 dark:border-white/[0.07] dark:bg-gray-800/70 dark:backdrop-blur-xl">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
                        <div>
                            <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
                                Flaky Tests
                            </h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                Tests with intermittent failures
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 rounded-xl bg-gray-100/70 px-3 py-1.5 dark:bg-white/[0.04]">
                                <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                    Period
                                </label>
                                <select
                                    value={days}
                                    onChange={(e) => updateDays(parseInt(e.target.value))}
                                    className="bg-transparent text-xs font-medium text-gray-900 outline-none dark:text-white">
                                    <option value="7">7 days</option>
                                    <option value="14">14 days</option>
                                    <option value="30">30 days</option>
                                    <option value="60">60 days</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2 rounded-xl bg-gray-100/70 px-3 py-1.5 dark:bg-white/[0.04]">
                                <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                    Threshold
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="99"
                                    value={threshold}
                                    onChange={(e) => updateThreshold(parseInt(e.target.value))}
                                    className="w-10 bg-transparent text-xs font-medium tabular-nums text-gray-900 outline-none dark:text-white"
                                />
                                <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
                                    %
                                </span>
                            </div>
                        </div>
                    </div>

                    {flakyLoading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <div
                                    key={i}
                                    className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.05]"
                                />
                            ))}
                        </div>
                    ) : !flakyTests || flakyTests.length === 0 ? (
                        <div className="flex flex-col items-center py-12 text-center">
                            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-success-50 ring-1 ring-success-600/15 dark:bg-success-500/10 dark:ring-success-400/20">
                                <PartyPopper className="h-7 w-7 text-success-500 dark:text-success-400" />
                            </div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                No flaky tests detected!
                            </p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                                All tests are stable
                            </p>
                        </div>
                    ) : (
                        <div className="stagger space-y-2 max-h-96 overflow-y-auto pr-1">
                            {flakyTests.map((test) => (
                                <div
                                    key={test.testId}
                                    onClick={() => handleFlakyTestClick(test.testId)}
                                    className="cursor-pointer rounded-xl border border-gray-200/70 p-3.5 transition-all duration-150 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-card dark:border-white/[0.06] dark:hover:border-white/10 dark:hover:bg-white/[0.03]">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                                                {test.name}
                                            </p>
                                            <p className="mt-0.5 truncate font-mono text-xs text-gray-400 dark:text-gray-500">
                                                {test.filePath}
                                            </p>
                                        </div>
                                        <div className="flex flex-shrink-0 items-center gap-3">
                                            <div className="text-right">
                                                <p className="text-lg font-bold tabular-nums text-warning-600 dark:text-warning-400">
                                                    {test.flakyPercentage}%
                                                </p>
                                                <p className="text-xs tabular-nums text-gray-400 dark:text-gray-500">
                                                    {test.failedRuns}/{test.totalRuns} failed
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-2.5 flex items-center gap-1">
                                        {test.history.slice(-15).map((status, idx) => (
                                            <span
                                                key={idx}
                                                title={`Run ${idx + 1}: ${status}`}
                                                className={`h-2 w-3.5 rounded-full ${
                                                    status === 'passed'
                                                        ? 'bg-success-500/80 dark:bg-success-400/70'
                                                        : 'bg-danger-500/80 dark:bg-danger-400/70'
                                                }`}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-card transition-all duration-200 dark:border-white/[0.07] dark:bg-gray-800/70 dark:backdrop-blur-xl">
                    <div className="mb-6">
                        <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
                            Test Execution Timeline
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                            Last 30 days activity
                        </p>
                    </div>

                    {timelineLoading ? (
                        <div className="h-64 animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.05]" />
                    ) : !timelineData || timelineData.length === 0 ? (
                        <div className="flex flex-col items-center py-12 text-center">
                            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-white/[0.04]">
                                <BarChart2 className="h-7 w-7 text-gray-400 dark:text-gray-500" />
                            </div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                No test data available
                            </p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                                Run some tests to see timeline
                            </p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={240}>
                            <AreaChart
                                data={timelineData}
                                margin={{top: 10, right: 10, left: 0, bottom: 0}}>
                                <defs>
                                    <linearGradient
                                        id="flakyGradientPassed"
                                        x1="0"
                                        y1="0"
                                        x2="0"
                                        y2="1">
                                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                                        <stop
                                            offset="100%"
                                            stopColor="#10b981"
                                            stopOpacity={0.02}
                                        />
                                    </linearGradient>
                                    <linearGradient
                                        id="flakyGradientFailed"
                                        x1="0"
                                        y1="0"
                                        x2="0"
                                        y2="1">
                                        <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.35} />
                                        <stop
                                            offset="100%"
                                            stopColor="#f43f5e"
                                            stopOpacity={0.02}
                                        />
                                    </linearGradient>
                                    <linearGradient
                                        id="flakyGradientSkipped"
                                        x1="0"
                                        y1="0"
                                        x2="0"
                                        y2="1">
                                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                                        <stop
                                            offset="100%"
                                            stopColor="#f59e0b"
                                            stopOpacity={0.02}
                                        />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid
                                    strokeDasharray="4 4"
                                    stroke="#94a3b8"
                                    strokeOpacity={0.18}
                                    vertical={false}
                                />
                                <XAxis
                                    dataKey="date"
                                    tick={{fontSize: 12, fill: '#94a3b8'}}
                                    tickLine={false}
                                    axisLine={{stroke: '#94a3b8', strokeOpacity: 0.2}}
                                    tickFormatter={(value) => {
                                        const date = new Date(value)
                                        return `${date.getMonth() + 1}/${date.getDate()}`
                                    }}
                                />
                                <YAxis
                                    tick={{fontSize: 12, fill: '#94a3b8'}}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip
                                    cursor={{stroke: '#94a3b8', strokeOpacity: 0.25}}
                                    contentStyle={{
                                        backgroundColor: 'rgba(31, 31, 46, 0.95)',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: '0.875rem',
                                        boxShadow: '0 12px 32px -8px rgba(0,0,0,0.45)',
                                        color: 'white',
                                        fontSize: '12px',
                                        padding: '10px 14px',
                                    }}
                                    labelStyle={{
                                        color: 'rgb(148 163 184)',
                                        fontWeight: 600,
                                        marginBottom: '4px',
                                    }}
                                    itemStyle={{padding: '2px 0'}}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="passed"
                                    stackId="1"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    fill="url(#flakyGradientPassed)"
                                    name="Passed"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="failed"
                                    stackId="1"
                                    stroke="#f43f5e"
                                    strokeWidth={2}
                                    fill="url(#flakyGradientFailed)"
                                    name="Failed"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="skipped"
                                    stackId="1"
                                    stroke="#f59e0b"
                                    strokeWidth={2}
                                    fill="url(#flakyGradientSkipped)"
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

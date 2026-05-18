import {useState, useEffect} from 'react'
import {useTestsStore} from '@features/tests/store/testsStore'
import {ProgressBar} from '@/shared/components/atoms/ProgressBar'
import {LoadingSpinner} from '@/shared/components/atoms/LoadingSpinner'
import {TestDetailModal} from '../testDetail/TestDetailModal'
import {TestResult} from '@yshvydak/core'

const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) {
        return `${seconds}s`
    }
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
}

export const FloatingProgressPanel = () => {
    const {activeProgress, clearProgress, tests} = useTestsStore()
    const [isMinimized, setIsMinimized] = useState(false)
    const [shouldAutoHide, setShouldAutoHide] = useState(false)
    const [detailModalOpen, setDetailModalOpen] = useState(false)
    const [detailModalTest, setDetailModalTest] = useState<TestResult | null>(null)

    // Auto-hide after 5 seconds when completed
    useEffect(() => {
        if (
            activeProgress &&
            activeProgress.completedTests === activeProgress.totalTests &&
            activeProgress.totalTests > 0
        ) {
            const timer = setTimeout(() => {
                setShouldAutoHide(true)
                setTimeout(() => {
                    clearProgress()
                }, 300) // Wait for fade out animation
            }, 5000)

            return () => clearTimeout(timer)
        }
    }, [activeProgress, clearProgress])

    const handleCloseModal = () => {
        setDetailModalOpen(false)
        setDetailModalTest(null)
    }

    const handleTestClick = (runningTest: {testId: string; name: string; filePath: string}) => {
        // Try to find the test in the tests array
        const foundTest = tests.find((t) => t.testId === runningTest.testId)

        if (foundTest) {
            // Use the found test with all its data
            setDetailModalTest(foundTest)
            setDetailModalOpen(true)
        } else if (activeProgress) {
            // Create a minimal test object for running tests that haven't completed yet
            const pendingTest: TestResult = {
                id: runningTest.testId, // Use testId as id temporarily
                testId: runningTest.testId,
                name: runningTest.name,
                filePath: runningTest.filePath,
                status: 'pending',
                duration: 0,
                runId: activeProgress.processId,
                createdAt: new Date().toISOString(),
            }
            setDetailModalTest(pendingTest)
            setDetailModalOpen(true)
        }
    }

    if (!activeProgress || shouldAutoHide) {
        return (
            <>
                {/* Test Detail Modal - keep modal available even when panel is hidden */}
                <TestDetailModal
                    test={detailModalTest}
                    isOpen={detailModalOpen}
                    onClose={handleCloseModal}
                />
            </>
        )
    }

    const percentage =
        activeProgress.totalTests > 0
            ? (activeProgress.completedTests / activeProgress.totalTests) * 100
            : 0

    const elapsedTime = Date.now() - activeProgress.startTime
    const estimatedRemaining = activeProgress.estimatedEndTime
        ? activeProgress.estimatedEndTime - Date.now()
        : null

    if (isMinimized) {
        return (
            <>
                <div
                    className="fixed bottom-3 right-3 md:bottom-4 md:right-4 z-50 bg-white dark:bg-gray-800/90 dark:backdrop-blur-xl rounded-2xl shadow-pop border border-gray-200/80 dark:border-white/10 px-4 py-2.5 cursor-pointer hover:-translate-y-0.5 hover:shadow-glow transition-all duration-200 animate-scale-in"
                    onClick={() => setIsMinimized(false)}
                    role="button"
                    aria-label="Expand progress panel">
                    <div className="flex items-center gap-2.5">
                        <LoadingSpinner size="sm" />
                        <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                            {activeProgress.completedTests}/{activeProgress.totalTests} tests
                        </span>
                        <span className="text-xs font-semibold tabular-nums text-primary-600 dark:text-primary-400">
                            {percentage.toFixed(0)}%
                        </span>
                    </div>
                </div>
                {/* Test Detail Modal - keep modal available when minimized */}
                <TestDetailModal
                    test={detailModalTest}
                    isOpen={detailModalOpen}
                    onClose={handleCloseModal}
                />
            </>
        )
    }

    return (
        <div className="fixed bottom-3 left-3 right-3 md:left-auto md:right-4 md:bottom-4 z-50 md:w-96 bg-white dark:bg-gray-800/90 dark:backdrop-blur-xl rounded-2xl shadow-pop border border-gray-200/80 dark:border-white/10 overflow-hidden transition-all duration-200 animate-scale-in">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/70 dark:border-white/[0.06]">
                <div className="flex items-center gap-2.5">
                    <span className="text-lg">🧪</span>
                    <h3 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                        Running Tests
                    </h3>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setIsMinimized(true)}
                        className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-white/[0.06] dark:hover:text-gray-300 transition-colors"
                        aria-label="Minimize">
                        <span>−</span>
                    </button>
                    <button
                        onClick={() => clearProgress()}
                        className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-white/[0.06] dark:hover:text-gray-300 transition-colors"
                        aria-label="Close">
                        <span>✕</span>
                    </button>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="px-4 py-3">
                <ProgressBar percentage={percentage} variant="primary" showLabel={false} />
                <div className="flex justify-between items-center mt-2.5">
                    <span className="text-sm font-medium tabular-nums text-gray-600 dark:text-gray-300">
                        {activeProgress.completedTests} of {activeProgress.totalTests} tests
                    </span>
                    <span className="text-sm font-bold tabular-nums text-primary-600 dark:text-primary-400">
                        {percentage.toFixed(0)}%
                    </span>
                </div>
            </div>

            {/* Stats */}
            <div className="px-4 py-3 bg-gray-50 dark:bg-white/[0.03] grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-1.5">
                    <span>✅</span>
                    <span className="text-gray-500 dark:text-gray-400">Passed:</span>
                    <span className="font-semibold tabular-nums text-success-600 dark:text-success-400">
                        {activeProgress.passedTests}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span>❌</span>
                    <span className="text-gray-500 dark:text-gray-400">Failed:</span>
                    <span className="font-semibold tabular-nums text-danger-600 dark:text-danger-400">
                        {activeProgress.failedTests}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span>⏭️</span>
                    <span className="text-gray-500 dark:text-gray-400">Skipped:</span>
                    <span className="font-semibold tabular-nums text-gray-600 dark:text-gray-300">
                        {activeProgress.skippedTests}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span>⏸️</span>
                    <span className="text-gray-500 dark:text-gray-400">Pending:</span>
                    <span className="font-semibold tabular-nums text-gray-600 dark:text-gray-300">
                        {activeProgress.totalTests - activeProgress.completedTests}
                    </span>
                </div>
            </div>

            {/* Running Tests */}
            {activeProgress.runningTests.length > 0 && (
                <div className="px-4 py-3 border-t border-gray-200/70 dark:border-white/[0.06]">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                        Currently Running
                    </h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                        {activeProgress.runningTests.slice(0, 3).map((test) => (
                            <div
                                key={test.testId}
                                className="text-xs bg-primary-50 dark:bg-primary-500/[0.08] ring-1 ring-inset ring-primary-600/10 dark:ring-primary-400/15 rounded-xl p-2.5 cursor-pointer hover:bg-primary-100 dark:hover:bg-primary-500/[0.14] transition-colors duration-150"
                                onClick={() => handleTestClick(test)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        handleTestClick(test)
                                    }
                                }}
                                aria-label={`Open details for ${test.name}`}>
                                <div className="flex items-start gap-1">
                                    <LoadingSpinner size="sm" />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                                            {test.name}
                                        </div>
                                        <div className="font-mono text-gray-400 dark:text-gray-500 truncate">
                                            {test.filePath}
                                        </div>
                                        {test.currentStep && (
                                            <div className="text-gray-600 dark:text-gray-300 mt-1">
                                                → {test.currentStep}
                                                {test.stepProgress && (
                                                    <span className="ml-1 tabular-nums text-gray-400 dark:text-gray-500">
                                                        ({test.stepProgress.current}/
                                                        {test.stepProgress.total})
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {activeProgress.runningTests.length > 3 && (
                            <div className="text-xs font-medium text-gray-400 dark:text-gray-500 text-center">
                                +{activeProgress.runningTests.length - 3} more...
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Time Estimate */}
            <div className="px-4 py-3 border-t border-gray-200/70 dark:border-white/[0.06] flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                    <span>⏱️</span>
                    <span>Elapsed:</span>
                    <span className="font-medium tabular-nums text-gray-900 dark:text-gray-100">
                        {formatTime(elapsedTime)}
                    </span>
                </div>
                {estimatedRemaining !== null && estimatedRemaining > 0 && (
                    <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                        <span>Est. remaining:</span>
                        <span className="font-medium tabular-nums text-gray-900 dark:text-gray-100">
                            ~{formatTime(estimatedRemaining)}
                        </span>
                    </div>
                )}
            </div>

            {/* Test Detail Modal */}
            <TestDetailModal
                test={detailModalTest}
                isOpen={detailModalOpen}
                onClose={handleCloseModal}
            />
        </div>
    )
}

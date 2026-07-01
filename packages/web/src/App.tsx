import {useState, useEffect, useMemo, useCallback} from 'react'
import {Routes, Route, useLocation, useNavigate, Navigate} from 'react-router-dom'
import {TestResult} from '@yshvydak/core'
import {Header} from '@shared/components'
import {Dashboard} from '@features/dashboard'
import {SettingsModal} from '@features/dashboard/components/settings'
import {DiskSpaceWarningBanner} from '@features/dashboard/components/DiskSpaceWarningBanner'
import {CIAutoRunPauseBanner} from '@features/dashboard/components/CIAutoRunPauseBanner'
import {useDiskSpaceWarning} from '@features/dashboard/hooks'
import {useCIAutoRun} from '@/hooks/useCIAutoRun'
import {TestsList} from '@features/tests'
import {FloatingProgressPanel} from '@features/tests/components/progress/FloatingProgressPanel'
import {LoginPage, setGlobalLogout} from '@features/authentication'
import {useTestsStore} from '@features/tests/store/testsStore'
import {useProjectTabs} from '@/hooks/useProjectTabs'
import {VERSION} from '@/config/version'
import {useWebSocket} from './hooks/useWebSocket'
import {config} from '@config/environment.config'
import {verifyToken} from '@features/authentication/utils/tokenValidator'

function App() {
    const location = useLocation()
    const navigate = useNavigate()
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [selectedTest, setSelectedTest] = useState<TestResult | null>(null)
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [settingsScrollToDataRetention, setSettingsScrollToDataRetention] = useState(false)

    const {severity, diskStats, thresholds, isDismissed, dismiss, triggerCheck} =
        useDiskSpaceWarning(isAuthenticated)
    const {
        pause: ciPause,
        resume: resumeCIAutoRun,
        reload: reloadCIAutoRun,
    } = useCIAutoRun(isAuthenticated)

    const handleOpenSettingsToDataRetention = useCallback(() => {
        setSettingsScrollToDataRetention(true)
        setIsSettingsOpen(true)
    }, [])

    // Active project from URL query param
    const activeProject = useMemo(() => {
        const params = new URLSearchParams(location.search)
        return params.get('project') || ''
    }, [location.search])

    const {
        visibleTabs,
        isLoading: tabsLoading,
        reload: reloadProjectTabs,
    } = useProjectTabs(isAuthenticated)

    const {
        fetchTests,
        isLoading: testsLoading,
        rerunTest,
        checkAndRestoreActiveStates,
    } = useTestsStore()

    // Setup global logout function
    useEffect(() => {
        const handleLogout = () => {
            setIsAuthenticated(false)
            setIsLoading(false)
        }

        setGlobalLogout(handleLogout)
    }, [])

    // Cmd+K / Ctrl+K — focus search on tests page
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                const params = new URLSearchParams(location.search)
                params.set('focusSearch', '1')
                navigate(`/tests?${params.toString()}`, {replace: location.pathname === '/tests'})
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [navigate, location.pathname, location.search])

    // Check authentication status and verify token validity
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const authData = localStorage.getItem('_auth')
                if (!authData) {
                    setIsAuthenticated(false)
                    setIsLoading(false)
                    return
                }

                const parsed = JSON.parse(authData)
                const hasToken = parsed?.auth?.token || parsed?.token

                if (!hasToken) {
                    setIsAuthenticated(false)
                    setIsLoading(false)
                    return
                }

                // Check if token has expired locally before making API call
                if (parsed.expiresAt && Date.now() >= parsed.expiresAt) {
                    console.log('Token expired locally, logging out')
                    localStorage.removeItem('_auth')
                    sessionStorage.removeItem('_auth')
                    setIsAuthenticated(false)
                    setIsLoading(false)
                    return
                }

                const result = await verifyToken()

                if (result.valid) {
                    setIsAuthenticated(true)
                } else {
                    localStorage.removeItem('_auth')
                    sessionStorage.removeItem('_auth')
                    setIsAuthenticated(false)
                }
            } catch {
                setIsAuthenticated(false)
            } finally {
                setIsLoading(false)
            }
        }

        checkAuth()
    }, [])

    // Periodic token verification (every 5 minutes)
    useEffect(() => {
        if (!isAuthenticated) {
            return
        }

        const checkTokenPeriodically = async () => {
            // First check local expiration to avoid unnecessary API calls
            try {
                const authData = localStorage.getItem('_auth')
                if (authData) {
                    const parsed = JSON.parse(authData)
                    if (parsed.expiresAt && Date.now() >= parsed.expiresAt) {
                        console.log('Token expired locally during periodic check')
                        setIsAuthenticated(false)
                        localStorage.removeItem('_auth')
                        sessionStorage.removeItem('_auth')
                        return
                    }
                }
            } catch (error) {
                console.error('Error checking local token expiration:', error)
            }

            const result = await verifyToken()

            if (!result.valid) {
                setIsAuthenticated(false)
                localStorage.removeItem('_auth')
                sessionStorage.removeItem('_auth')
            }
        }

        const interval = setInterval(
            () => {
                checkTokenPeriodically()
            },
            5 * 60 * 1000
        )

        return () => clearInterval(interval)
    }, [isAuthenticated])

    // Get JWT token for WebSocket connection with proper memoization
    const webSocketUrl = useMemo(() => {
        // Don't connect to WebSocket if loading or not authenticated
        if (isLoading || !isAuthenticated) {
            return null
        }

        // Only connect to WebSocket if we're authenticated
        // Try to get token directly from storage
        try {
            const authData = localStorage.getItem('_auth') || sessionStorage.getItem('_auth')
            if (authData) {
                const parsedAuth = JSON.parse(authData)
                let token = null

                if (parsedAuth?.auth?.token) {
                    token = parsedAuth.auth.token
                } else if (parsedAuth?.token) {
                    token = parsedAuth.token
                }

                if (token) {
                    return `${config.websocket.url}?token=${encodeURIComponent(token)}`
                }
            }
        } catch {
            // Silent error handling
        }

        // Return null if no token found (shouldn't happen if authenticated, but safety check)
        return null
    }, [isAuthenticated, isLoading])

    // WebSocket connection for live updates
    const {isConnected} = useWebSocket(webSocketUrl, {onRunCompleted: triggerCheck})

    useEffect(() => {
        // Only initialize if authenticated
        if (isAuthenticated) {
            const initializeApp = async () => {
                await checkAndRestoreActiveStates()
                fetchTests()
            }

            initializeApp()

            // Periodic update every 30 seconds
            const interval = setInterval(() => {
                fetchTests()
            }, 30000)

            return () => clearInterval(interval)
        }
    }, [fetchTests, checkAndRestoreActiveStates, isAuthenticated])

    const handleTestSelect = (test: TestResult) => {
        setSelectedTest(test)
    }

    const handleTestRerun = async (testId: string) => {
        await rerunTest(testId)
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
                <div className="text-center animate-fade-in">
                    <div className="mx-auto h-12 w-12 animate-spin rounded-full border-[3px] border-primary-500 border-t-transparent" />
                    <p className="mt-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                        Loading…
                    </p>
                </div>
            </div>
        )
    }

    // If not authenticated, show login page
    if (!isAuthenticated) {
        return (
            <Routes>
                <Route path="*" element={<LoginPage />} />
            </Routes>
        )
    }

    // Authenticated user interface
    return (
        <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
            <Header
                activeProject={activeProject}
                projectTabs={visibleTabs}
                tabsLoading={tabsLoading}
                wsConnected={isConnected}
                onOpenSettings={() => setIsSettingsOpen(true)}
                user={() => {
                    try {
                        const authData = localStorage.getItem('_auth')
                        if (authData) {
                            const parsed = JSON.parse(authData)
                            return parsed?.user || parsed?.auth?.user || null
                        }
                    } catch {}
                    return null
                }}
            />

            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => {
                    setIsSettingsOpen(false)
                    setSettingsScrollToDataRetention(false)
                    void reloadCIAutoRun()
                    void reloadProjectTabs()
                }}
                scrollToDataRetention={settingsScrollToDataRetention}
                activeProject={activeProject || undefined}
            />

            {ciPause?.paused && (
                <CIAutoRunPauseBanner resumeAt={ciPause.resumeAt} onResume={resumeCIAutoRun} />
            )}

            {severity && !isDismissed && diskStats && thresholds && (
                <DiskSpaceWarningBanner
                    severity={severity}
                    diskStats={diskStats}
                    thresholds={thresholds}
                    onDismiss={dismiss}
                    onFreeUpSpace={handleOpenSettingsToDataRetention}
                />
            )}

            <main className="flex-1 overflow-hidden flex flex-col container mx-auto px-3 md:px-4">
                <Routes>
                    <Route path="/" element={<Navigate to="/tests" replace />} />
                    <Route
                        path="/tests"
                        element={
                            <TestsList
                                onTestSelect={handleTestSelect}
                                onTestRerun={handleTestRerun}
                                selectedTest={selectedTest}
                                loading={testsLoading}
                                activeProject={activeProject}
                            />
                        }
                    />
                    <Route
                        path="/dashboard"
                        element={
                            <div className="overflow-y-auto h-full py-4 md:py-8">
                                <Dashboard />
                            </div>
                        }
                    />
                </Routes>
            </main>

            {/* Floating Progress Panel */}
            <FloatingProgressPanel />

            {/* Footer */}
            <footer className="border-t border-gray-200/70 bg-white/60 backdrop-blur-sm dark:border-white/[0.06] dark:bg-gray-950/40">
                <div className="container mx-auto px-3 md:px-4 py-4 md:py-6">
                    <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-2">
                        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 text-center sm:text-left">
                            © 2025{' '}
                            <a
                                href="https://github.com/shvydak/yshvydak-test-dashboard"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                title="View project on GitHub">
                                YShvydak Test Dashboard
                            </a>
                            . Created by{' '}
                            <a
                                href="https://github.com/shvydak/yshvydak-test-dashboard"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                title="View project on GitHub">
                                Yurii Shvydak
                            </a>
                            .
                        </p>
                        <div className="flex items-center space-x-4">
                            <span className="text-xs text-gray-500 dark:text-gray-500 hidden sm:inline">
                                Welcome,{' '}
                                {(() => {
                                    try {
                                        const authData = localStorage.getItem('_auth')
                                        if (authData) {
                                            const parsed = JSON.parse(authData)
                                            const user = parsed?.user || parsed?.auth?.user
                                            return user?.email || 'User'
                                        }
                                    } catch {}
                                    return 'User'
                                })()}
                            </span>
                            <a
                                href={VERSION.releaseUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-gray-500 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                title="View release notes on GitHub">
                                v{VERSION.web}
                            </a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    )
}

export default App

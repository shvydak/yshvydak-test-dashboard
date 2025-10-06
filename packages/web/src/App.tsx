import {useState, useEffect, useMemo} from 'react'
import {Routes, Route} from 'react-router-dom'
import {TestResult} from '@yshvydak/core'
import {Header} from '@shared/components'
import {Dashboard} from '@features/dashboard'
import {TestsList} from '@features/tests'
import {LoginPage, setGlobalLogout} from '@features/authentication'
import {useTestsStore} from '@features/tests/store/testsStore'
import {useWebSocket} from './hooks/useWebSocket'
import {config} from '@config/environment.config'
import {verifyToken} from '@features/authentication/utils/tokenValidator'

type ViewMode = 'dashboard' | 'tests'

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [currentView, setCurrentView] = useState<ViewMode>('dashboard')
    const [selectedTest, setSelectedTest] = useState<TestResult | null>(null)
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

                const result = await verifyToken()

                if (result.valid) {
                    setIsAuthenticated(true)
                } else {
                    localStorage.removeItem('_auth')
                    sessionStorage.removeItem('_auth')
                    setIsAuthenticated(false)
                }
            } catch (error) {
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
        // Only connect to WebSocket if we're authenticated AND not loading
        if (isAuthenticated && !isLoading) {
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
            } catch (error) {
                // Silent error handling
            }
        }

        // Return null to prevent WebSocket connection when not ready
        if (isLoading) {
            return null
        }

        return config.websocket.url
    }, [isAuthenticated, isLoading])

    // WebSocket connection for live updates
    const {isConnected} = useWebSocket(webSocketUrl)

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
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
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
        <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
            <Header
                currentView={currentView}
                onViewChange={setCurrentView}
                wsConnected={isConnected}
                user={() => {
                    try {
                        const authData = localStorage.getItem('_auth')
                        if (authData) {
                            const parsed = JSON.parse(authData)
                            return parsed?.user || parsed?.auth?.user || null
                        }
                    } catch (error) {}
                    return null
                }}
            />

            <main className="flex-1 overflow-y-auto container mx-auto px-4 py-8">
                <Routes>
                    <Route
                        path="/"
                        element={
                            currentView === 'dashboard' ? (
                                <Dashboard />
                            ) : (
                                <TestsList
                                    onTestSelect={handleTestSelect}
                                    onTestRerun={handleTestRerun}
                                    selectedTest={selectedTest}
                                    loading={testsLoading}
                                />
                            )
                        }
                    />
                    <Route
                        path="/tests"
                        element={
                            <TestsList
                                onTestSelect={handleTestSelect}
                                onTestRerun={handleTestRerun}
                                selectedTest={selectedTest}
                                loading={testsLoading}
                            />
                        }
                    />
                    <Route path="/dashboard" element={<Dashboard />} />
                </Routes>
            </main>

            {/* Footer */}
            <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-12">
                <div className="container mx-auto px-4 py-6">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            © 2025 YShvydak Test Dashboard. Created by Yurii Shvydak.
                        </p>
                        <div className="flex items-center space-x-4">
                            <span className="text-xs text-gray-500 dark:text-gray-500">
                                Welcome,{' '}
                                {(() => {
                                    try {
                                        const authData = localStorage.getItem('_auth')
                                        if (authData) {
                                            const parsed = JSON.parse(authData)
                                            const user = parsed?.user || parsed?.auth?.user
                                            return user?.email || 'User'
                                        }
                                    } catch (error) {}
                                    return 'User'
                                })()}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-500">v1.0.0</span>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    )
}

export default App

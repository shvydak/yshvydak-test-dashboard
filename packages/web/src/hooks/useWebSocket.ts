import {useEffect, useRef, useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {useTestsStore} from '@features/tests/store/testsStore'

interface WebSocketMessage {
    type: string
    data?: any
    timestamp?: string
    clientId?: string
}

interface WebSocketOptions {
    onTestCompleted?: (data: any) => void
    onRunCompleted?: (data: any) => void
    onPipelineEvent?: (type: string, data: any) => void
    onRunStatusEvent?: (type: string, data: any) => void
    onTestsDeleted?: (data: any) => void
}

// Max one list refresh per window while results stream in. Shared by every socket on the
// page (App, modal, Dashboard each open one), so a progress event never triggers 2-3 fetches.
// A refresh is a full list GET + count queries, so the window is long and a hidden tab skips it.
export const PROGRESS_REFRESH_INTERVAL_MS = 10000
// Delete events arrive once per socket (2-3 per page): coalesce them into one refresh.
export const DELETE_REFRESH_DELAY_MS = 300
let lastProgressRefresh = 0
let progressRefreshTimer: ReturnType<typeof setTimeout> | null = null
let deleteRefreshTimer: ReturnType<typeof setTimeout> | null = null
let pendingWhileHidden: (() => unknown) | null = null

export function resetProgressRefreshThrottle() {
    lastProgressRefresh = 0
    pendingWhileHidden = null
    if (progressRefreshTimer) clearTimeout(progressRefreshTimer)
    if (deleteRefreshTimer) clearTimeout(deleteRefreshTimer)
    progressRefreshTimer = null
    deleteRefreshTimer = null
}

function refreshTestsThrottled(fetchTests: () => unknown) {
    if (typeof document !== 'undefined' && document.hidden) {
        pendingWhileHidden = fetchTests
        return
    }
    if (progressRefreshTimer) return
    const wait = PROGRESS_REFRESH_INTERVAL_MS - (Date.now() - lastProgressRefresh)
    if (wait <= 0) {
        lastProgressRefresh = Date.now()
        fetchTests()
        return
    }
    // Trailing call so the last results of a burst are not left until the 30s poll
    progressRefreshTimer = setTimeout(() => {
        progressRefreshTimer = null
        lastProgressRefresh = Date.now()
        fetchTests()
    }, wait)
}

function refreshAfterDelete(refresh: () => unknown) {
    if (deleteRefreshTimer) return
    deleteRefreshTimer = setTimeout(() => {
        deleteRefreshTimer = null
        refresh()
    }, DELETE_REFRESH_DELAY_MS)
}

// One refresh when the tab becomes visible again, if results arrived while it was hidden
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden || !pendingWhileHidden) return
        const fetchTests = pendingWhileHidden
        pendingWhileHidden = null
        refreshTestsThrottled(fetchTests)
    })
}

export function useWebSocket(url: string | null, options?: WebSocketOptions) {
    const [isConnected, setIsConnected] = useState(false)
    const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
    const wsRef = useRef<WebSocket | null>(null)
    const queryClient = useQueryClient()
    const {
        fetchTests,
        fetchRuns,
        setGroupRunning,
        setTestRunning,
        setRunningAllTests,
        updateProgress,
        clearProgress,
        resetRunState,
    } = useTestsStore()
    const reconnectTimeoutRef = useRef<NodeJS.Timeout>()
    const reconnectAttempts = useRef(0)
    const hasConnectedBefore = useRef(false)
    // Set by disconnect(): a close we caused (unmount, URL null) must never reconnect, whatever
    // its close code (a socket closed while CONNECTING reports 1006, not 1000).
    const closedByUs = useRef(false)

    const handleConnectionStatus = (statusData: any) => {
        const {activeRuns, activeGroups: _activeGroups, isAnyProcessRunning} = statusData

        // Clear all current running states first
        setRunningAllTests(false)

        // Clear any existing running test/group states
        // Note: In a real implementation, we might want to track and clear these individually
        // For now, we rely on the store to handle this properly

        // Restore states based on active processes
        if (isAnyProcessRunning && activeRuns.length > 0) {
            activeRuns.forEach((run: any) => {
                switch (run.type) {
                    case 'run-all':
                        setRunningAllTests(true)
                        break
                    case 'run-group':
                        if (run.details.filePath) {
                            setGroupRunning(run.details.filePath, true)
                        }
                        break
                    case 'rerun':
                        if (run.details.originalTestId) {
                            setTestRunning(run.details.originalTestId, true)
                        }
                        break
                }

                // Restore progress if available
                if (run.progress) {
                    updateProgress(run.progress)
                }
            })
        } else {
            // Ensure all states are cleared
            clearProgress()
        }

        // Refresh data to get latest state
        fetchTests()
        fetchRuns()
    }

    const connect = () => {
        // Don't connect if URL is null
        if (!url) {
            return
        }

        try {
            const ws = new WebSocket(url)
            wsRef.current = ws

            ws.onopen = () => {
                setIsConnected(true)
                reconnectAttempts.current = 0
                // Events broadcast while the socket was down are lost: re-read once.
                if (hasConnectedBefore.current) {
                    fetchTests()
                    fetchRuns()
                }
                hasConnectedBefore.current = true
            }

            ws.onmessage = (event) => {
                try {
                    const message: WebSocketMessage = JSON.parse(event.data)
                    setLastMessage(message)
                    handleMessage(message)
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error)
                }
            }

            ws.onclose = () => {
                // A replaced socket (URL change) or one we closed ourselves is not a drop
                if (closedByUs.current || wsRef.current !== ws) return
                setIsConnected(false)

                // Keep retrying (a server restart can outlast any fixed attempt count); backoff caps at 30s.
                const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)

                reconnectTimeoutRef.current = setTimeout(() => {
                    if (closedByUs.current) return
                    reconnectAttempts.current++
                    connect()
                }, delay)
            }

            ws.onerror = (error) => {
                console.error('❌ WebSocket error:', error)
            }
        } catch (error) {
            console.error('Error creating WebSocket connection:', error)
        }
    }

    const handleMessage = (message: WebSocketMessage) => {
        switch (message.type) {
            case 'dashboard:refresh':
                // Refresh both React Query and Zustand store
                queryClient.invalidateQueries()
                fetchTests()
                fetchRuns()

                // Notify about run completion if it's a rerun
                if (message.data?.isRerun && options?.onRunCompleted) {
                    options.onRunCompleted(message.data)
                }
                break

            case 'run:status':
                // Refresh both stores
                queryClient.invalidateQueries({
                    queryKey: ['dashboard-stats'],
                })
                queryClient.invalidateQueries({queryKey: ['project-status-summary']})
                queryClient.invalidateQueries({queryKey: ['test-status-counts']})
                fetchTests()
                fetchRuns()

                // Notify about run completion
                if (options?.onRunCompleted) {
                    options.onRunCompleted(message.data)
                }
                break

            case 'test:completed':
                queryClient.invalidateQueries({
                    queryKey: ['dashboard-stats'],
                })
                queryClient.invalidateQueries({queryKey: ['project-status-summary']})
                queryClient.invalidateQueries({queryKey: ['test-status-counts']})
                fetchTests()
                break

            case 'test:status':
                fetchTests()
                break

            case 'test:progress':
                // Update progress state with real-time progress data
                if (message.data) {
                    updateProgress(message.data)
                }
                // One saved result = one progress event: keep row statuses live during a run
                refreshTestsThrottled(fetchTests)
                break

            case 'tests:deleted':
                // Delete (test, execution, project, all, cleanup) from any client: re-read lists.
                refreshAfterDelete(() => {
                    queryClient.invalidateQueries({queryKey: ['storage-stats']})
                    queryClient.invalidateQueries({queryKey: ['dashboard-stats']})
                    fetchTests()
                    fetchRuns()
                })
                options?.onTestsDeleted?.(message.data)
                break

            case 'stats:update':
                queryClient.invalidateQueries({
                    queryKey: ['dashboard-stats'],
                })
                fetchTests()
                break

            case 'discovery:completed':
                queryClient.invalidateQueries({
                    queryKey: ['dashboard-stats'],
                })
                queryClient.invalidateQueries({queryKey: ['project-status-summary']})
                queryClient.invalidateQueries({queryKey: ['test-status-counts']})
                fetchTests()
                fetchRuns()
                break

            case 'run:started':
                fetchRuns()
                break

            case 'run:completed':
                queryClient.invalidateQueries({
                    queryKey: ['dashboard-stats'],
                })
                queryClient.invalidateQueries({queryKey: ['project-status-summary']})
                queryClient.invalidateQueries({queryKey: ['test-status-counts']})
                fetchTests()
                fetchRuns()

                // Clear progress when run completes
                clearProgress()

                // Clear group running state if this was a group run
                if (message.data?.type === 'run-group' && message.data?.filePath) {
                    setGroupRunning(message.data.filePath, false)
                }

                // Clear run-all state if this was a run-all
                if (message.data?.type === 'run-all') {
                    setRunningAllTests(false)
                }

                // Clear individual test running state if this was a rerun
                if (message.data?.isRerun && message.data?.originalTestId) {
                    setTestRunning(message.data.originalTestId, false)
                }

                // Notify about run completion
                if (options?.onRunCompleted) {
                    options.onRunCompleted(message.data)
                }
                break

            case 'run:stopping':
                options?.onPipelineEvent?.(message.type, message.data)
                break

            case 'run:cancelled':
                // The stopped run's data is gone: every test shows its previous result again.
                queryClient.invalidateQueries({queryKey: ['dashboard-stats']})
                queryClient.invalidateQueries({queryKey: ['project-status-summary']})
                queryClient.invalidateQueries({queryKey: ['test-status-counts']})
                resetRunState()
                fetchTests()
                fetchRuns()
                options?.onPipelineEvent?.(message.type, message.data)
                options?.onRunStatusEvent?.(message.type, message.data)
                break

            case 'connection':
                break

            case 'connection:status':
                handleConnectionStatus(message.data)
                options?.onRunStatusEvent?.('connection:status', message.data)
                break

            case 'process:started':
                // Refresh data when process starts
                fetchTests()
                fetchRuns()
                options?.onRunStatusEvent?.('process:started', message.data)
                break

            case 'process:ended':
                // Refresh data when process ends and request updated connection status
                fetchTests()
                fetchRuns()
                break

            case 'pong':
                // Keep-alive response
                break

            case 'pipeline:started':
            case 'pipeline:step-started':
            case 'pipeline:step-completed':
            case 'pipeline:completed':
            case 'pipeline:queue-changed':
                options?.onPipelineEvent?.(message.type, message.data)
                break

            default:
            // Unknown message type - ignore
        }
    }

    const sendMessage = (message: WebSocketMessage) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(message))
        }
    }

    const disconnect = () => {
        closedByUs.current = true
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current)
        }

        if (wsRef.current) {
            wsRef.current.close(1000, 'Intentional disconnect')
        }
    }

    useEffect(() => {
        // Only try to connect if we have a valid URL
        if (url) {
            closedByUs.current = false
            connect()
        } else {
            // Disconnect existing connection if URL becomes null
            disconnect()
            setIsConnected(false)
        }

        // Send periodic ping to keep connection alive
        const pingInterval = setInterval(() => {
            if (isConnected) {
                sendMessage({type: 'ping'})
            }
        }, 30000)

        return () => {
            clearInterval(pingInterval)
            disconnect()
        }
    }, [url])

    return {
        isConnected,
        lastMessage,
        sendMessage,
        disconnect,
    }
}

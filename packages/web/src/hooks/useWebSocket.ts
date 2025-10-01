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
}

export function useWebSocket(url: string | null, options?: WebSocketOptions) {
    const [isConnected, setIsConnected] = useState(false)
    const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
    const wsRef = useRef<WebSocket | null>(null)
    const queryClient = useQueryClient()
    const {fetchTests, fetchRuns, setGroupRunning, setTestRunning, setRunningAllTests} =
        useTestsStore()
    const reconnectTimeoutRef = useRef<NodeJS.Timeout>()
    const reconnectAttempts = useRef(0)
    const maxReconnectAttempts = 5

    const handleConnectionStatus = (statusData: any) => {
        const {activeRuns, activeGroups, isAnyProcessRunning} = statusData

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
            })
        } else {
            // Ensure all states are cleared
            // Note: We don't need to clear individual running states here as the store
            // should handle this, but we can add it if needed
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
            wsRef.current = new WebSocket(url)

            wsRef.current.onopen = () => {
                setIsConnected(true)
                reconnectAttempts.current = 0
            }

            wsRef.current.onmessage = (event) => {
                try {
                    const message: WebSocketMessage = JSON.parse(event.data)
                    setLastMessage(message)
                    handleMessage(message)
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error)
                }
            }

            wsRef.current.onclose = (event) => {
                setIsConnected(false)

                // Attempt to reconnect
                if (reconnectAttempts.current < maxReconnectAttempts) {
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)

                    reconnectTimeoutRef.current = setTimeout(() => {
                        reconnectAttempts.current++
                        connect()
                    }, delay)
                } else {
                    console.error('❌ Max reconnection attempts reached')
                }
            }

            wsRef.current.onerror = (error) => {
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
                queryClient.invalidateQueries({queryKey: ['tests']})
                queryClient.invalidateQueries({queryKey: ['runs']})
                fetchTests()
                fetchRuns()

                // Notify about run completion
                if (options?.onRunCompleted) {
                    options.onRunCompleted(message.data)
                }
                break

            case 'test:completed':
                queryClient.invalidateQueries({queryKey: ['tests']})
                queryClient.invalidateQueries({
                    queryKey: ['dashboard-stats'],
                })
                fetchTests()
                break

            case 'test:status':
                queryClient.invalidateQueries({queryKey: ['tests']})
                fetchTests()
                break

            case 'stats:update':
                queryClient.invalidateQueries({
                    queryKey: ['dashboard-stats'],
                })
                fetchTests()
                break

            case 'discovery:completed':
                queryClient.invalidateQueries({queryKey: ['tests']})
                queryClient.invalidateQueries({
                    queryKey: ['dashboard-stats'],
                })
                fetchTests()
                fetchRuns()
                break

            case 'run:started':
                queryClient.invalidateQueries({queryKey: ['runs']})
                fetchRuns()
                break

            case 'run:completed':
                queryClient.invalidateQueries({queryKey: ['tests']})
                queryClient.invalidateQueries({queryKey: ['runs']})
                queryClient.invalidateQueries({
                    queryKey: ['dashboard-stats'],
                })
                fetchTests()
                fetchRuns()

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

            case 'connection':
                break

            case 'connection:status':
                handleConnectionStatus(message.data)
                break

            case 'process:started':
                // Refresh data when process starts
                fetchTests()
                fetchRuns()
                break

            case 'process:ended':
                // Refresh data when process ends and request updated connection status
                fetchTests()
                fetchRuns()
                break

            case 'pong':
                // Keep-alive response
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

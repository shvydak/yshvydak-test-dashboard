import {useCallback, useEffect, useRef, useState} from 'react'
import {useQueryClient, type QueryClient} from '@tanstack/react-query'
import {useShallow} from 'zustand/react/shallow'
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
    // A test result was saved, a run ended or results were deleted: failure counts may have changed.
    onResultsChanged?: () => void
}

// Max one list refresh per window (a full list GET + counts); a hidden tab skips it. Only the fallback: a saved result patches its row.
export const PROGRESS_REFRESH_INTERVAL_MS = 10000
// A delete is followed by an event burst from the server: coalesce it into one refresh.
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

type StoreActions = Pick<
    ReturnType<typeof useTestsStore.getState>,
    | 'fetchTests'
    | 'setGroupRunning'
    | 'setTestRunning'
    | 'setRunningAllTests'
    | 'applyRunSnapshot'
    | 'updateProgress'
    | 'applyLiveResult'
    | 'clearProgress'
    | 'resetRunState'
>

// Store functions are stable: the hook subscribes to no state, so a store change never re-renders its host.
const selectSocketActions = (s: StoreActions): StoreActions => ({
    fetchTests: s.fetchTests,
    setGroupRunning: s.setGroupRunning,
    setTestRunning: s.setTestRunning,
    setRunningAllTests: s.setRunningAllTests,
    applyRunSnapshot: s.applyRunSnapshot,
    updateProgress: s.updateProgress,
    applyLiveResult: s.applyLiveResult,
    clearProgress: s.clearProgress,
    resetRunState: s.resetRunState,
})

interface SocketDeps {
    actions: StoreActions
    queryClient: QueryClient
}

// One hook instance = one subscriber. Its callbacks and deps are read at dispatch time, never captured.
interface Subscriber {
    options: () => WebSocketOptions | undefined
    deps: () => SocketDeps
}

// The tab's one socket per URL: store/cache work runs once per event, then each subscriber's callbacks.
class SharedSocket {
    connected = false
    private ws: WebSocket | null = null
    private subscribers = new Set<Subscriber>()
    private statusListeners = new Set<(connected: boolean) => void>()
    private reconnectTimeout: ReturnType<typeof setTimeout> | undefined
    private reconnectAttempts = 0
    private hasConnectedBefore = false
    // A close we caused never reconnects, whatever its code (CONNECTING close reports 1006)
    private closedByUs = false

    constructor(private url: string) {}

    addSubscriber(sub: Subscriber) {
        this.subscribers.add(sub)
    }

    // Returns true when no subscriber is left (the caller drops the connection).
    removeSubscriber(sub: Subscriber): boolean {
        this.subscribers.delete(sub)
        return this.subscribers.size === 0
    }

    onStatus(listener: (connected: boolean) => void) {
        this.statusListeners.add(listener)
        return () => {
            this.statusListeners.delete(listener)
        }
    }

    send(message: WebSocketMessage) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message))
        }
    }

    open() {
        this.closedByUs = false
        this.connect()
    }

    close() {
        this.closedByUs = true
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout)
        if (this.ws) this.ws.close(1000, 'Intentional disconnect')
    }

    private setConnected(connected: boolean) {
        this.connected = connected
        this.statusListeners.forEach((listener) => listener(connected))
    }

    private deps(): SocketDeps | null {
        for (const sub of this.subscribers) return sub.deps()
        return null
    }

    private notify<K extends keyof WebSocketOptions>(
        name: K,
        ...args: Parameters<NonNullable<WebSocketOptions[K]>>
    ) {
        this.subscribers.forEach((sub) => {
            const callback = sub.options()?.[name] as ((...a: unknown[]) => void) | undefined
            try {
                callback?.(...args)
            } catch (error) {
                // One consumer's failure must not skip the others
                console.error(`WebSocket ${name} callback failed:`, error)
            }
        })
    }

    private connect() {
        try {
            const ws = new WebSocket(this.url)
            this.ws = ws

            ws.onopen = () => {
                this.setConnected(true)
                this.reconnectAttempts = 0
                // Events broadcast while the socket was down are lost: re-read once.
                if (this.hasConnectedBefore) this.deps()?.actions.fetchTests()
                this.hasConnectedBefore = true
            }

            ws.onmessage = (event) => {
                try {
                    const message: WebSocketMessage = JSON.parse(event.data)
                    this.handleMessage(message)
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error)
                }
            }

            ws.onclose = () => {
                // A replaced socket or one we closed ourselves is not a drop
                if (this.closedByUs || this.ws !== ws) return
                this.setConnected(false)

                // Keep retrying (a server restart can outlast any fixed attempt count); backoff caps at 30s.
                const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)

                this.reconnectTimeout = setTimeout(() => {
                    if (this.closedByUs) return
                    this.reconnectAttempts++
                    this.connect()
                }, delay)
            }

            ws.onerror = (error) => {
                console.error('❌ WebSocket error:', error)
            }
        } catch (error) {
            console.error('Error creating WebSocket connection:', error)
        }
    }

    private handleConnectionStatus(statusData: any, actions: StoreActions) {
        const {activeRuns, isAnyProcessRunning} = statusData
        const runs: any[] = isAnyProcessRunning && Array.isArray(activeRuns) ? activeRuns : []

        // The snapshot is the truth: a missed run:completed must not leave a stuck spinner.
        actions.applyRunSnapshot({
            isRunningAll: runs.some((run) => run.type === 'run-all'),
            testIds: runs
                .filter((run) => run.type === 'rerun' && run.details?.originalTestId)
                .map((run) => run.details.originalTestId),
            filePaths: runs
                .filter((run) => run.type === 'run-group' && run.details?.filePath)
                .map((run) => run.details.filePath),
        })

        if (runs.length > 0) {
            runs.forEach((run) => {
                // Restore progress if available
                if (run.progress) {
                    actions.updateProgress(run.progress)
                }
            })
        } else {
            // Ensure all states are cleared
            actions.clearProgress()
        }

        // Refresh data to get latest state
        actions.fetchTests()
    }

    private handleMessage(message: WebSocketMessage) {
        const deps = this.deps()
        if (!deps) return
        const {actions, queryClient} = deps
        const {fetchTests} = actions

        switch (message.type) {
            case 'dashboard:refresh':
                // Refresh both React Query and Zustand store
                queryClient.invalidateQueries()
                fetchTests()

                // Notify about run completion if it's a rerun
                if (message.data?.isRerun) this.notify('onRunCompleted', message.data)
                break

            case 'run:status':
                // Refresh both stores
                queryClient.invalidateQueries({
                    queryKey: ['dashboard-stats'],
                })
                queryClient.invalidateQueries({queryKey: ['project-status-summary']})
                queryClient.invalidateQueries({queryKey: ['test-status-counts']})
                fetchTests()

                // Notify about run completion
                this.notify('onRunCompleted', message.data)
                break

            case 'test:completed':
                this.notify('onResultsChanged')
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
                if (message.data) {
                    const {result, phase, ...progress} = message.data
                    actions.updateProgress(progress)
                    if (phase === 'started') break
                    if (phase === 'saved') this.notify('onResultsChanged')
                    // A saved result carries its row: patch it, no list reload. An unknown row
                    // (new test) or an old server without `phase` falls back to the throttled reload.
                    if (phase === 'saved' && result && actions.applyLiveResult(result)) break
                }
                refreshTestsThrottled(fetchTests)
                break

            case 'tests:deleted':
                // Delete (test, execution, project, all, cleanup) from any client: re-read lists.
                refreshAfterDelete(() => {
                    queryClient.invalidateQueries({queryKey: ['storage-stats']})
                    queryClient.invalidateQueries({queryKey: ['dashboard-stats']})
                    fetchTests()
                })
                this.notify('onTestsDeleted', message.data)
                this.notify('onResultsChanged')
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
                break

            case 'jira:synced':
                // The chips query fired before the post-Discover sync ended and cached "absent" keys.
                queryClient.invalidateQueries({queryKey: ['jira-ticket-info']})
                break

            case 'run:completed':
                this.notify('onResultsChanged')
                queryClient.invalidateQueries({
                    queryKey: ['dashboard-stats'],
                })
                queryClient.invalidateQueries({queryKey: ['project-status-summary']})
                queryClient.invalidateQueries({queryKey: ['test-status-counts']})
                fetchTests()

                // Clear progress when run completes
                actions.clearProgress()

                // Clear group running state if this was a group run
                if (message.data?.type === 'run-group' && message.data?.filePath) {
                    actions.setGroupRunning(message.data.filePath, false)
                }

                // Clear run-all state if this was a run-all
                if (message.data?.type === 'run-all') {
                    actions.setRunningAllTests(false)
                }

                // Clear individual test running state if this was a rerun
                if (message.data?.isRerun && message.data?.originalTestId) {
                    actions.setTestRunning(message.data.originalTestId, false)
                }

                // Notify about run completion
                this.notify('onRunCompleted', message.data)
                break

            case 'run:stopping':
                this.notify('onPipelineEvent', message.type, message.data)
                break

            case 'run:cancelled':
                // The stopped run's data is gone: every test shows its previous result again.
                queryClient.invalidateQueries({queryKey: ['dashboard-stats']})
                queryClient.invalidateQueries({queryKey: ['project-status-summary']})
                queryClient.invalidateQueries({queryKey: ['test-status-counts']})
                actions.resetRunState()
                fetchTests()
                this.notify('onPipelineEvent', message.type, message.data)
                this.notify('onRunStatusEvent', message.type, message.data)
                break

            case 'connection:status':
                this.handleConnectionStatus(message.data, actions)
                this.notify('onRunStatusEvent', 'connection:status', message.data)
                break

            case 'process:started':
                // Refresh data when process starts
                fetchTests()
                this.notify('onRunStatusEvent', 'process:started', message.data)
                break

            case 'process:ended':
                // Refresh data when process ends and request updated connection status
                fetchTests()
                break

            case 'pipeline:started':
            case 'pipeline:step-started':
            case 'pipeline:step-completed':
            case 'pipeline:completed':
            case 'pipeline:queue-changed':
                this.notify('onPipelineEvent', message.type, message.data)
                break

            default:
            // connection, pong, run:started (nothing reads the runs list) and unknown types: ignore
        }
    }
}

const sockets = new Map<string, SharedSocket>()

function acquireSocket(url: string, sub: Subscriber): SharedSocket {
    let socket = sockets.get(url)
    const isNew = !socket
    if (!socket) {
        socket = new SharedSocket(url)
        sockets.set(url, socket)
    }
    socket.addSubscriber(sub)
    if (isNew) socket.open()
    return socket
}

function releaseSocket(url: string, socket: SharedSocket, sub: Subscriber) {
    if (!socket.removeSubscriber(sub)) return
    socket.close()
    if (sockets.get(url) === socket) sockets.delete(url)
}

export function useWebSocket(url: string | null, options?: WebSocketOptions) {
    const [isConnected, setIsConnected] = useState(false)
    const queryClient = useQueryClient()
    const actions = useTestsStore(useShallow(selectSocketActions))
    // The socket outlives renders: dispatch through refs so callbacks are never from connect time.
    const optionsRef = useRef(options)
    optionsRef.current = options
    const depsRef = useRef<SocketDeps>({actions, queryClient})
    depsRef.current = {actions, queryClient}
    const socketRef = useRef<SharedSocket | null>(null)
    const leaveRef = useRef<() => void>(() => {})

    useEffect(() => {
        if (!url) {
            setIsConnected(false)
            return
        }
        const sub: Subscriber = {options: () => optionsRef.current, deps: () => depsRef.current}
        const socket = acquireSocket(url, sub)
        socketRef.current = socket
        setIsConnected(socket.connected)
        const offStatus = socket.onStatus(setIsConnected)
        let left = false
        const leave = () => {
            if (left) return
            left = true
            offStatus()
            releaseSocket(url, socket, sub)
            socketRef.current = null
        }
        leaveRef.current = leave
        return leave
    }, [url])

    const sendMessage = useCallback((message: WebSocketMessage) => {
        socketRef.current?.send(message)
    }, [])

    // Leaves the shared socket; it closes once no consumer is left.
    const disconnect = useCallback(() => leaveRef.current(), [])

    return {isConnected, sendMessage, disconnect}
}

/**
 * Tests for useWebSocket Hook
 *
 * Critical frontend hook that manages WebSocket lifecycle for real-time updates.
 *
 * Test Coverage:
 * - Connection lifecycle (connect, disconnect, reconnect)
 * - Reconnection with capped exponential backoff (never gives up)
 * - Message parsing and handling
 * - State synchronization (tests, runs, running states)
 * - handleConnectionStatus() - restore active processes
 * - Query invalidation on updates
 * - Keep-alive ping mechanism
 *
 * Target Coverage: 75%+
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {renderHook, act} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {
    useWebSocket,
    resetProgressRefreshThrottle,
    PROGRESS_REFRESH_INTERVAL_MS,
    DELETE_REFRESH_DELAY_MS,
} from '../useWebSocket'
import {useTestsStore} from '@features/tests/store/testsStore'
import React from 'react'

// Mock the testsStore
vi.mock('@features/tests/store/testsStore', () => ({
    useTestsStore: vi.fn(),
}))

// Create a simpler mock WebSocket implementation
class MockWebSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3

    url: string
    readyState: number = MockWebSocket.OPEN // Start as open immediately for simplicity
    onopen: ((event: Event) => void) | null = null
    onclose: ((event: CloseEvent) => void) | null = null
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: ((event: Event) => void) | null = null
    private messageQueue: string[] = []

    constructor(url: string) {
        this.url = url
        // Call onopen immediately (synchronously for testing)
        queueMicrotask(() => {
            this.onopen?.(new Event('open'))
        })
    }

    send(data: string) {
        if (this.readyState === MockWebSocket.OPEN) {
            this.messageQueue.push(data)
        }
    }

    close(code?: number, reason?: string) {
        this.readyState = MockWebSocket.CLOSED
        const event = new CloseEvent('close', {code, reason})
        setTimeout(() => this.onclose?.(event), 0)
    }

    // Simulate receiving a message
    simulateMessage(data: any) {
        if (this.readyState === MockWebSocket.OPEN) {
            const event = new MessageEvent('message', {
                data: typeof data === 'string' ? data : JSON.stringify(data),
            })
            this.onmessage?.(event)
        }
    }

    // Simulate error
    simulateError() {
        this.onerror?.(new Event('error'))
    }

    getMessageQueue() {
        return this.messageQueue
    }
}

describe('useWebSocket', () => {
    let mockWebSocket: MockWebSocket
    let queryClient: QueryClient
    let mockStoreActions: any

    // Helper to create wrapper with QueryClientProvider
    const createWrapper = () => {
        queryClient = new QueryClient({
            defaultOptions: {
                queries: {retry: false},
                mutations: {retry: false},
            },
        })
        return function TestWrapper({children}: {children: React.ReactNode}) {
            return React.createElement(QueryClientProvider, {client: queryClient}, children)
        }
    }

    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()
        resetProgressRefreshThrottle()

        // Mock store actions
        mockStoreActions = {
            fetchTests: vi.fn(),
            fetchRuns: vi.fn(),
            setGroupRunning: vi.fn(),
            setTestRunning: vi.fn(),
            setRunningAllTests: vi.fn(),
            updateProgress: vi.fn(),
            clearProgress: vi.fn(),
            resetRunState: vi.fn(),
        }

        // Mock useTestsStore to return our mock actions
        vi.mocked(useTestsStore).mockReturnValue(mockStoreActions as any)

        // Mock WebSocket globally
        global.WebSocket = MockWebSocket as any

        // Intercept WebSocket creation to capture instance
        const OriginalWebSocket = global.WebSocket
        global.WebSocket = vi.fn(function (url: string) {
            mockWebSocket = new OriginalWebSocket(url) as any
            return mockWebSocket
        }) as any
        // Set WebSocket constants
        Object.defineProperty(global.WebSocket, 'CONNECTING', {value: MockWebSocket.CONNECTING})
        Object.defineProperty(global.WebSocket, 'OPEN', {value: MockWebSocket.OPEN})
        Object.defineProperty(global.WebSocket, 'CLOSING', {value: MockWebSocket.CLOSING})
        Object.defineProperty(global.WebSocket, 'CLOSED', {value: MockWebSocket.CLOSED})
    })

    afterEach(() => {
        vi.clearAllTimers()
        vi.useRealTimers()
    })

    describe('Connection Lifecycle', () => {
        it('should not connect when URL is null', () => {
            const {result} = renderHook(() => useWebSocket(null), {
                wrapper: createWrapper(),
            })

            expect(result.current.isConnected).toBe(false)
            expect(global.WebSocket).not.toHaveBeenCalled()
        })

        it('should connect when URL is provided', async () => {
            const url = 'ws://localhost:3001'
            const {result} = renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            expect(global.WebSocket).toHaveBeenCalledWith(url)

            // Process microtask for onopen
            await act(async () => {
                await Promise.resolve()
            })

            expect(result.current.isConnected).toBe(true)
        })

        it('should disconnect when URL changes to null', async () => {
            const url = 'ws://localhost:3001'
            const {result, rerender} = renderHook(
                ({url}: {url: string | null}) => useWebSocket(url),
                {
                    initialProps: {url: url as string | null},
                    wrapper: createWrapper(),
                }
            )

            await act(async () => {
                await Promise.resolve()
            })

            expect(result.current.isConnected).toBe(true)

            // Change URL to null
            await act(async () => {
                rerender({url: null})
                await Promise.resolve()
            })

            expect(result.current.isConnected).toBe(false)
        })

        it('should cleanup on unmount', async () => {
            const url = 'ws://localhost:3001'
            const {unmount} = renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const closeSpy = vi.spyOn(mockWebSocket, 'close')

            unmount()

            expect(closeSpy).toHaveBeenCalled()
        })

        it('should disconnect with correct close code on intentional disconnect', async () => {
            const url = 'ws://localhost:3001'
            const {result} = renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            expect(result.current.isConnected).toBe(true)

            const closeSpy = vi.spyOn(mockWebSocket, 'close')

            act(() => {
                result.current.disconnect()
            })

            expect(closeSpy).toHaveBeenCalledWith(1000, 'Intentional disconnect')
        })
    })

    describe('Reconnection Logic', () => {
        it.skip('should attempt to reconnect on connection close', async () => {
            const url = 'ws://localhost:3001'
            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const callsBeforeClose = (global.WebSocket as any).mock.calls.length

            // Simulate connection close
            act(() => {
                mockWebSocket.close()
                vi.advanceTimersByTime(0) // Process close event
            })

            // Fast-forward to trigger reconnection
            await act(async () => {
                vi.advanceTimersByTime(1000) // First retry delay
                await Promise.resolve()
            })

            // Should have attempted reconnection (one more call)
            expect((global.WebSocket as any).mock.calls.length).toBe(callsBeforeClose + 1)
        })

        it.skip('should use exponential backoff for reconnection delays', async () => {
            const url = 'ws://localhost:3001'
            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            // Test exponential backoff: 1000ms, 2000ms, 4000ms
            const expectedDelays = [1000, 2000, 4000]

            for (let i = 0; i < expectedDelays.length; i++) {
                const callsBefore = (global.WebSocket as any).mock.calls.length

                // Close connection
                act(() => {
                    mockWebSocket.close()
                    vi.advanceTimersByTime(0)
                })

                // Advance by expected delay
                await act(async () => {
                    vi.advanceTimersByTime(expectedDelays[i])
                    await Promise.resolve()
                })

                // Should have attempted reconnection
                const callsAfter = (global.WebSocket as any).mock.calls.length
                expect(callsAfter).toBe(callsBefore + 1)
            }
        })

        it('should reset reconnection counter on successful connection', async () => {
            const url = 'ws://localhost:3001'
            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            // Close and reconnect twice
            for (let i = 0; i < 2; i++) {
                act(() => {
                    mockWebSocket.close()
                    vi.advanceTimersByTime(0)
                })

                await act(async () => {
                    vi.advanceTimersByTime(Math.pow(2, i) * 1000)
                    await Promise.resolve()
                })
            }

            // Connection is now successful, counter should reset
            // Now close again and check delay is back to 1000ms (first attempt)
            const callsBefore = (global.WebSocket as any).mock.calls.length

            act(() => {
                mockWebSocket.close()
                vi.advanceTimersByTime(0)
            })

            // Try short delay (should NOT reconnect if counter wasn't reset)
            await act(async () => {
                vi.advanceTimersByTime(500)
            })

            const callsAfterShort = (global.WebSocket as any).mock.calls.length
            expect(callsAfterShort).toBe(callsBefore) // No reconnection yet

            // Try full delay
            await act(async () => {
                vi.advanceTimersByTime(500)
                await Promise.resolve()
            })

            const callsAfterFull = (global.WebSocket as any).mock.calls.length
            expect(callsAfterFull).toBe(callsBefore + 1) // Reconnection happened at 1000ms
        })

        it.skip('should cap reconnection delay at 30 seconds', async () => {
            const url = 'ws://localhost:3001'
            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            // Close connection multiple times to exceed cap
            // Delays: 1000, 2000, 4000, 8000, 16000 (next would be 32000 but capped at 30000)
            // Only do 4 attempts to avoid hitting max reconnection limit
            for (let i = 0; i < 4; i++) {
                act(() => {
                    mockWebSocket.close()
                    vi.advanceTimersByTime(0)
                })

                await act(async () => {
                    vi.advanceTimersByTime(30000)
                    await Promise.resolve()
                })
            }

            const callsBefore = (global.WebSocket as any).mock.calls.length

            // Close one more time - delay should be capped at 30000
            act(() => {
                mockWebSocket.close()
                vi.advanceTimersByTime(0)
            })

            // Advance by 29 seconds (should NOT reconnect)
            await act(async () => {
                vi.advanceTimersByTime(29000)
            })

            expect((global.WebSocket as any).mock.calls.length).toBe(callsBefore)

            // Advance by 1 more second (should reconnect at 30s cap)
            await act(async () => {
                vi.advanceTimersByTime(1000)
                await Promise.resolve()
            })

            expect((global.WebSocket as any).mock.calls.length).toBe(callsBefore + 1)
        })
    })

    describe('Message Handling', () => {
        it('should parse and handle incoming messages', async () => {
            const url = 'ws://localhost:3001'
            const {result} = renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const message = {type: 'test:completed', data: {testId: '123'}}

            act(() => {
                mockWebSocket.simulateMessage(message)
            })

            expect(result.current.lastMessage).toEqual(message)
        })

        it('should handle malformed JSON gracefully', async () => {
            const url = 'ws://localhost:3001'
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            act(() => {
                mockWebSocket.simulateMessage('invalid json {')
            })

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Error parsing WebSocket message'),
                expect.any(Error)
            )

            consoleErrorSpy.mockRestore()
        })

        it('should call onRunCompleted callback for dashboard:refresh with rerun', async () => {
            const url = 'ws://localhost:3001'
            const onRunCompleted = vi.fn()

            renderHook(() => useWebSocket(url, {onRunCompleted}), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const message = {
                type: 'dashboard:refresh',
                data: {isRerun: true, testId: '123'},
            }

            act(() => {
                mockWebSocket.simulateMessage(message)
            })

            expect(onRunCompleted).toHaveBeenCalledWith(message.data)
        })

        it('should invalidate queries on dashboard:refresh', async () => {
            const url = 'ws://localhost:3001'
            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

            const message = {type: 'dashboard:refresh'}

            act(() => {
                mockWebSocket.simulateMessage(message)
            })

            expect(invalidateQueriesSpy).toHaveBeenCalled()
            expect(mockStoreActions.fetchTests).toHaveBeenCalled()
            expect(mockStoreActions.fetchRuns).toHaveBeenCalled()
        })
    })

    describe('Reconnect keeps trying', () => {
        // A server that is down: the first socket connects, every later one never opens
        // and closes straight away (code 1006), like a refused connection.
        class DownServerSocket {
            static instances: DownServerSocket[] = []
            static CONNECTING = 0
            static OPEN = 1
            static CLOSING = 2
            static CLOSED = 3
            readyState = 0
            onopen: any = null
            onclose: any = null
            onmessage: any = null
            onerror: any = null
            closeCalls: Array<[number?, string?]> = []
            constructor(public url: string) {
                DownServerSocket.instances.push(this)
            }
            close(code?: number, reason?: string) {
                this.closeCalls.push([code, reason])
                this.readyState = 3
                // Browsers report 1006 for a socket closed while still CONNECTING
                const wasConnecting = this.closeCalls.length === 1 && this.neverOpened
                queueMicrotask(() =>
                    this.onclose?.({code: wasConnecting ? 1006 : (code ?? 1005), reason: ''})
                )
            }
            neverOpened = true
            send() {}
            drop() {
                this.readyState = 3
                this.onclose?.({code: 1006, reason: ''})
            }
        }

        const installDownServer = () => {
            DownServerSocket.instances = []
            global.WebSocket = DownServerSocket as any
        }

        it('keeps reconnecting after more than 5 failed attempts, with backoff capped at 30s', async () => {
            installDownServer()
            renderHook(() => useWebSocket('ws://localhost:3001'), {wrapper: createWrapper()})
            expect(DownServerSocket.instances).toHaveLength(1)

            // The server is down: each socket fails without ever opening.
            for (let i = 0; i < 9; i++) {
                act(() => {
                    DownServerSocket.instances[DownServerSocket.instances.length - 1].drop()
                })
                await act(async () => {
                    vi.advanceTimersByTime(30000)
                    await Promise.resolve()
                })
            }

            // Old behaviour stopped at 6 sockets (1 + 5 retries); now it never gives up
            expect(DownServerSocket.instances).toHaveLength(10)
        })

        it('waits no longer than 30s between attempts', async () => {
            installDownServer()
            renderHook(() => useWebSocket('ws://localhost:3001'), {wrapper: createWrapper()})
            for (let i = 0; i < 8; i++) {
                act(() => {
                    DownServerSocket.instances[DownServerSocket.instances.length - 1].drop()
                })
                await act(async () => {
                    vi.advanceTimersByTime(30000)
                })
            }
            const before = DownServerSocket.instances.length
            act(() => {
                DownServerSocket.instances[before - 1].drop()
            })
            await act(async () => {
                vi.advanceTimersByTime(29000)
            })
            expect(DownServerSocket.instances).toHaveLength(before)
            await act(async () => {
                vi.advanceTimersByTime(1000)
            })
            expect(DownServerSocket.instances).toHaveLength(before + 1)
        })

        it('unmount while still CONNECTING (close code 1006) never reconnects or leaks a socket', async () => {
            installDownServer()
            const {unmount} = renderHook(() => useWebSocket('ws://localhost:3001'), {
                wrapper: createWrapper(),
            })
            expect(DownServerSocket.instances).toHaveLength(1)

            unmount()
            await act(async () => {
                await Promise.resolve()
                vi.advanceTimersByTime(120000)
                await Promise.resolve()
            })

            expect(DownServerSocket.instances).toHaveLength(1)
            expect(DownServerSocket.instances[0].closeCalls).toHaveLength(1)
        })

        it('refreshes tests and runs once after a reconnect, not on the first connect', async () => {
            renderHook(() => useWebSocket('ws://localhost:3001'), {wrapper: createWrapper()})
            await act(async () => {
                await Promise.resolve()
            })
            expect(mockStoreActions.fetchTests).not.toHaveBeenCalled()

            act(() => {
                mockWebSocket.close()
                vi.advanceTimersByTime(0)
            })
            await act(async () => {
                vi.advanceTimersByTime(1000)
                await Promise.resolve()
            })

            expect(mockStoreActions.fetchTests).toHaveBeenCalledTimes(1)
            expect(mockStoreActions.fetchRuns).toHaveBeenCalledTimes(1)
        })

        it('does not reconnect after an intentional disconnect (unmount)', async () => {
            const {unmount} = renderHook(() => useWebSocket('ws://localhost:3001'), {
                wrapper: createWrapper(),
            })
            await act(async () => {
                await Promise.resolve()
            })
            const calls = (global.WebSocket as any).mock.calls.length

            unmount()
            await act(async () => {
                vi.advanceTimersByTime(60000)
                await Promise.resolve()
            })

            expect((global.WebSocket as any).mock.calls.length).toBe(calls)
        })
    })

    describe('Delete and progress refresh', () => {
        const open = async (options?: any) => {
            renderHook(() => useWebSocket('ws://localhost:3001', options), {
                wrapper: createWrapper(),
            })
            await act(async () => {
                await Promise.resolve()
            })
        }

        it('tests:deleted refreshes tests and runs and notifies the caller', async () => {
            const onTestsDeleted = vi.fn()
            await open({onTestsDeleted})

            act(() => {
                mockWebSocket.simulateMessage({
                    type: 'tests:deleted',
                    data: {scope: 'test', testId: 't1'},
                })
            })

            expect(onTestsDeleted).toHaveBeenCalledWith({scope: 'test', testId: 't1'})
            act(() => {
                vi.advanceTimersByTime(DELETE_REFRESH_DELAY_MS)
            })
            expect(mockStoreActions.fetchTests).toHaveBeenCalledTimes(1)
            expect(mockStoreActions.fetchRuns).toHaveBeenCalledTimes(1)
        })

        it('test:progress refreshes the list, at most once per window, with a trailing refresh', async () => {
            await open()
            const progress = {type: 'test:progress', data: {runId: 'r1'}}

            act(() => {
                mockWebSocket.simulateMessage(progress)
                mockWebSocket.simulateMessage(progress)
                mockWebSocket.simulateMessage(progress)
            })
            // First one goes through now, the rest collapse into one trailing call
            expect(mockStoreActions.fetchTests).toHaveBeenCalledTimes(1)

            act(() => {
                vi.advanceTimersByTime(PROGRESS_REFRESH_INTERVAL_MS)
            })
            expect(mockStoreActions.fetchTests).toHaveBeenCalledTimes(2)

            act(() => {
                vi.advanceTimersByTime(PROGRESS_REFRESH_INTERVAL_MS * 3)
            })
            expect(mockStoreActions.fetchTests).toHaveBeenCalledTimes(2)
        })

        it('uses a window of at least 10s between progress refreshes', () => {
            expect(PROGRESS_REFRESH_INTERVAL_MS).toBeGreaterThanOrEqual(10000)
        })

        describe('hidden tab', () => {
            const setHidden = (hidden: boolean) => {
                Object.defineProperty(document, 'hidden', {configurable: true, value: hidden})
                document.dispatchEvent(new Event('visibilitychange'))
            }
            afterEach(() => setHidden(false))

            it('skips progress refreshes while hidden, then refreshes once when visible again', async () => {
                await open()
                setHidden(true)

                act(() => {
                    mockWebSocket.simulateMessage({type: 'test:progress', data: {runId: 'r1'}})
                    mockWebSocket.simulateMessage({type: 'test:progress', data: {runId: 'r1'}})
                })
                act(() => {
                    vi.advanceTimersByTime(PROGRESS_REFRESH_INTERVAL_MS * 3)
                })
                expect(mockStoreActions.fetchTests).not.toHaveBeenCalled()

                act(() => setHidden(false))
                expect(mockStoreActions.fetchTests).toHaveBeenCalledTimes(1)
            })

            it('does not refresh on becoming visible when nothing changed while hidden', async () => {
                await open()
                act(() => setHidden(true))
                act(() => setHidden(false))

                expect(mockStoreActions.fetchTests).not.toHaveBeenCalled()
            })
        })

        it('coalesces the delete event of several sockets into one refresh', async () => {
            await open()
            const msg = {type: 'tests:deleted', data: {scope: 'test', testId: 't1'}}

            act(() => {
                mockWebSocket.simulateMessage(msg)
                mockWebSocket.simulateMessage(msg)
                mockWebSocket.simulateMessage(msg)
            })
            expect(mockStoreActions.fetchTests).not.toHaveBeenCalled()

            act(() => {
                vi.advanceTimersByTime(DELETE_REFRESH_DELAY_MS)
            })
            expect(mockStoreActions.fetchTests).toHaveBeenCalledTimes(1)
            expect(mockStoreActions.fetchRuns).toHaveBeenCalledTimes(1)
        })
    })

    describe('Message Types', () => {
        const testMessageType = async (
            messageType: string,
            additionalData?: any,
            expectedCalls?: {fetchTests?: boolean; fetchRuns?: boolean}
        ) => {
            const url = 'ws://localhost:3001'
            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const message = {type: messageType, data: additionalData}

            act(() => {
                mockWebSocket.simulateMessage(message)
            })

            if (expectedCalls?.fetchTests) {
                expect(mockStoreActions.fetchTests).toHaveBeenCalled()
            }
            if (expectedCalls?.fetchRuns) {
                expect(mockStoreActions.fetchRuns).toHaveBeenCalled()
            }
        }

        it('should handle run:status message', async () => {
            await testMessageType('run:status', {}, {fetchTests: true, fetchRuns: true})
        })

        it('should handle test:completed message', async () => {
            await testMessageType('test:completed', {}, {fetchTests: true})
        })

        it('should handle test:status message', async () => {
            await testMessageType('test:status', {}, {fetchTests: true})
        })

        it('should handle stats:update message', async () => {
            await testMessageType('stats:update', {}, {fetchTests: true})
        })

        it('should handle discovery:completed message', async () => {
            await testMessageType('discovery:completed', {}, {fetchTests: true, fetchRuns: true})
        })

        it('jira:synced invalidates the Jira ticket cache query', async () => {
            renderHook(() => useWebSocket('ws://localhost:3001'), {wrapper: createWrapper()})
            await act(async () => {
                await Promise.resolve()
            })
            const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

            act(() => {
                mockWebSocket.simulateMessage({type: 'jira:synced', data: {}})
            })

            expect(invalidate).toHaveBeenCalledWith({queryKey: ['jira-ticket-info']})
        })

        it('should handle run:started message', async () => {
            await testMessageType('run:started', {}, {fetchRuns: true})
        })

        it('should handle run:completed for run-group', async () => {
            const url = 'ws://localhost:3001'
            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const message = {
                type: 'run:completed',
                data: {type: 'run-group', filePath: 'tests/example.spec.ts'},
            }

            act(() => {
                mockWebSocket.simulateMessage(message)
            })

            expect(mockStoreActions.setGroupRunning).toHaveBeenCalledWith(
                'tests/example.spec.ts',
                false
            )
        })

        it('should handle run:completed for run-all', async () => {
            const url = 'ws://localhost:3001'
            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const message = {
                type: 'run:completed',
                data: {type: 'run-all'},
            }

            act(() => {
                mockWebSocket.simulateMessage(message)
            })

            expect(mockStoreActions.setRunningAllTests).toHaveBeenCalledWith(false)
        })

        it('should handle run:completed for rerun', async () => {
            const url = 'ws://localhost:3001'
            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const message = {
                type: 'run:completed',
                data: {isRerun: true, originalTestId: '123'},
            }

            act(() => {
                mockWebSocket.simulateMessage(message)
            })

            expect(mockStoreActions.setTestRunning).toHaveBeenCalledWith('123', false)
        })

        it('run:cancelled reverts the list: resets local run state, refetches, invalidates caches and tells the pipeline hook', async () => {
            const onPipelineEvent = vi.fn()
            const onRunStatusEvent = vi.fn()
            renderHook(
                () => useWebSocket('ws://localhost:3001', {onPipelineEvent, onRunStatusEvent}),
                {wrapper: createWrapper()}
            )
            await act(async () => {
                await Promise.resolve()
            })
            const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

            const data = {runIds: ['r1'], reason: 'manual', pipelineRunId: 'p1'}
            act(() => {
                mockWebSocket.simulateMessage({type: 'run:cancelled', data})
            })

            expect(mockStoreActions.resetRunState).toHaveBeenCalledTimes(1)
            expect(mockStoreActions.fetchTests).toHaveBeenCalled()
            expect(mockStoreActions.fetchRuns).toHaveBeenCalled()
            expect(invalidate).toHaveBeenCalledWith({queryKey: ['test-status-counts']})
            expect(invalidate).toHaveBeenCalledWith({queryKey: ['project-status-summary']})
            expect(onPipelineEvent).toHaveBeenCalledWith('run:cancelled', data)
            // the header project spinners resync from it too
            expect(onRunStatusEvent).toHaveBeenCalledWith('run:cancelled', data)
        })

        it('run:stopping is forwarded to the pipeline hook and changes nothing else', async () => {
            const onPipelineEvent = vi.fn()
            renderHook(() => useWebSocket('ws://localhost:3001', {onPipelineEvent}), {
                wrapper: createWrapper(),
            })
            await act(async () => {
                await Promise.resolve()
            })

            act(() => {
                mockWebSocket.simulateMessage({type: 'run:stopping', data: {reason: 'manual'}})
            })

            expect(onPipelineEvent).toHaveBeenCalledWith('run:stopping', {reason: 'manual'})
            expect(mockStoreActions.resetRunState).not.toHaveBeenCalled()
        })

        it('should handle connection message (no-op)', async () => {
            const url = 'ws://localhost:3001'
            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const message = {type: 'connection'}

            // Should not throw or cause issues
            act(() => {
                mockWebSocket.simulateMessage(message)
            })

            // Just verify no errors
            expect(true).toBe(true)
        })

        it('should handle pong message (keep-alive)', async () => {
            const url = 'ws://localhost:3001'
            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const message = {type: 'pong'}

            // Should not throw or cause issues
            act(() => {
                mockWebSocket.simulateMessage(message)
            })

            // Just verify no errors
            expect(true).toBe(true)
        })

        it('should handle unknown message types gracefully', async () => {
            const url = 'ws://localhost:3001'
            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const message = {type: 'unknown:type', data: {}}

            // Should not throw or cause issues
            act(() => {
                mockWebSocket.simulateMessage(message)
            })

            // Just verify no errors
            expect(true).toBe(true)
        })
    })

    describe('Connection Status Handler', () => {
        it('should restore run-all state from connection status', async () => {
            const url = 'ws://localhost:3001'
            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const message = {
                type: 'connection:status',
                data: {
                    activeRuns: [{type: 'run-all', details: {}}],
                    activeGroups: [],
                    isAnyProcessRunning: true,
                },
            }

            act(() => {
                mockWebSocket.simulateMessage(message)
            })

            expect(mockStoreActions.setRunningAllTests).toHaveBeenCalledWith(true)
            expect(mockStoreActions.fetchTests).toHaveBeenCalled()
            expect(mockStoreActions.fetchRuns).toHaveBeenCalled()
        })

        it('should restore run-group state from connection status', async () => {
            const url = 'ws://localhost:3001'
            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const message = {
                type: 'connection:status',
                data: {
                    activeRuns: [{type: 'run-group', details: {filePath: 'tests/example.spec.ts'}}],
                    activeGroups: [],
                    isAnyProcessRunning: true,
                },
            }

            act(() => {
                mockWebSocket.simulateMessage(message)
            })

            expect(mockStoreActions.setGroupRunning).toHaveBeenCalledWith(
                'tests/example.spec.ts',
                true
            )
        })

        it('should restore rerun state from connection status', async () => {
            const url = 'ws://localhost:3001'
            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const message = {
                type: 'connection:status',
                data: {
                    activeRuns: [{type: 'rerun', details: {originalTestId: '123'}}],
                    activeGroups: [],
                    isAnyProcessRunning: true,
                },
            }

            act(() => {
                mockWebSocket.simulateMessage(message)
            })

            expect(mockStoreActions.setTestRunning).toHaveBeenCalledWith('123', true)
        })

        it('should clear all states when no processes are running', async () => {
            const url = 'ws://localhost:3001'
            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const message = {
                type: 'connection:status',
                data: {
                    activeRuns: [],
                    activeGroups: [],
                    isAnyProcessRunning: false,
                },
            }

            act(() => {
                mockWebSocket.simulateMessage(message)
            })

            expect(mockStoreActions.setRunningAllTests).toHaveBeenCalledWith(false)
            expect(mockStoreActions.fetchTests).toHaveBeenCalled()
            expect(mockStoreActions.fetchRuns).toHaveBeenCalled()
        })

        it('should handle multiple active runs from connection status', async () => {
            const url = 'ws://localhost:3001'
            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const message = {
                type: 'connection:status',
                data: {
                    activeRuns: [
                        {type: 'run-group', details: {filePath: 'tests/test1.spec.ts'}},
                        {type: 'run-group', details: {filePath: 'tests/test2.spec.ts'}},
                        {type: 'rerun', details: {originalTestId: '123'}},
                    ],
                    activeGroups: [],
                    isAnyProcessRunning: true,
                },
            }

            act(() => {
                mockWebSocket.simulateMessage(message)
            })

            expect(mockStoreActions.setGroupRunning).toHaveBeenCalledWith(
                'tests/test1.spec.ts',
                true
            )
            expect(mockStoreActions.setGroupRunning).toHaveBeenCalledWith(
                'tests/test2.spec.ts',
                true
            )
            expect(mockStoreActions.setTestRunning).toHaveBeenCalledWith('123', true)
        })
    })

    describe('Process Messages', () => {
        it('should refresh data on process:started', async () => {
            const url = 'ws://localhost:3001'
            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const message = {type: 'process:started'}

            act(() => {
                mockWebSocket.simulateMessage(message)
            })

            expect(mockStoreActions.fetchTests).toHaveBeenCalled()
            expect(mockStoreActions.fetchRuns).toHaveBeenCalled()
        })

        it('should refresh data on process:ended', async () => {
            const url = 'ws://localhost:3001'
            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const message = {type: 'process:ended'}

            act(() => {
                mockWebSocket.simulateMessage(message)
            })

            expect(mockStoreActions.fetchTests).toHaveBeenCalled()
            expect(mockStoreActions.fetchRuns).toHaveBeenCalled()
        })
    })

    describe('Send Message', () => {
        it('should send messages when connected', async () => {
            const url = 'ws://localhost:3001'
            const {result} = renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            expect(result.current.isConnected).toBe(true)

            const message = {type: 'test:message', data: {test: 'data'}}

            act(() => {
                result.current.sendMessage(message)
            })

            const messageQueue = mockWebSocket.getMessageQueue()
            expect(messageQueue).toHaveLength(1)
            expect(JSON.parse(messageQueue[0])).toEqual(message)
        })

        it('should not send messages when disconnected', async () => {
            const url = 'ws://localhost:3001'
            const {result} = renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            // Disconnect
            act(() => {
                mockWebSocket.close()
                vi.advanceTimersByTime(0)
            })

            const message = {type: 'test:message', data: {test: 'data'}}

            act(() => {
                result.current.sendMessage(message)
            })

            // Should not have sent the message (close was simulated)
            // The message queue might have messages from before, so we check it didn't increase
            const initialQueueLength = mockWebSocket.getMessageQueue().length

            act(() => {
                result.current.sendMessage({type: 'another', data: {}})
            })

            expect(mockWebSocket.getMessageQueue().length).toBe(initialQueueLength)
        })
    })

    describe('Keep-Alive Ping', () => {
        it.skip('should send periodic ping messages when connected', async () => {
            const url = 'ws://localhost:3001'
            const {result} = renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            expect(result.current.isConnected).toBe(true)

            // Fast-forward 30 seconds to trigger ping
            await act(async () => {
                vi.advanceTimersByTime(30000)
            })

            const messageQueue = mockWebSocket.getMessageQueue()
            expect(messageQueue.length).toBeGreaterThan(0)

            const lastMessage = JSON.parse(messageQueue[messageQueue.length - 1])
            expect(lastMessage).toEqual({type: 'ping'})
        })

        it('should not send ping when disconnected', async () => {
            const url = 'ws://localhost:3001'
            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            // Disconnect
            act(() => {
                mockWebSocket.close()
                vi.advanceTimersByTime(0)
            })

            const queueLengthBefore = mockWebSocket.getMessageQueue().length

            // Fast-forward 30 seconds
            act(() => {
                vi.advanceTimersByTime(30000)
            })

            const queueLengthAfter = mockWebSocket.getMessageQueue().length
            expect(queueLengthAfter).toBe(queueLengthBefore) // No new messages
        })

        it.skip('should send multiple pings over time', async () => {
            const url = 'ws://localhost:3001'
            const {result} = renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            expect(result.current.isConnected).toBe(true)

            // Fast-forward 90 seconds (should send 3 pings)
            await act(async () => {
                vi.advanceTimersByTime(90000)
            })

            const messageQueue = mockWebSocket.getMessageQueue()
            const pingMessages = messageQueue.filter((msg) => {
                const parsed = JSON.parse(msg)
                return parsed.type === 'ping'
            })

            expect(pingMessages.length).toBeGreaterThanOrEqual(3)
        })
    })

    describe('Error Handling', () => {
        it('should handle WebSocket errors gracefully', async () => {
            const url = 'ws://localhost:3001'
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            act(() => {
                mockWebSocket.simulateError()
            })

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('WebSocket error'),
                expect.any(Event)
            )

            consoleErrorSpy.mockRestore()
        })

        it('should handle connection creation errors', async () => {
            const url = 'ws://localhost:3001'
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

            // Make WebSocket constructor throw
            global.WebSocket = vi.fn(() => {
                throw new Error('Connection failed')
            }) as any

            renderHook(() => useWebSocket(url), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Error creating WebSocket connection'),
                expect.any(Error)
            )

            consoleErrorSpy.mockRestore()
        })
    })

    describe('Callbacks', () => {
        it('forwards pipeline:queue-changed to onPipelineEvent', async () => {
            const onPipelineEvent = vi.fn()

            renderHook(() => useWebSocket('ws://localhost:3001', {onPipelineEvent}), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const message = {
                type: 'pipeline:queue-changed',
                data: {queue: [{pipeline: 'production', queuedAt: '2026-01-01T00:00:00.000Z'}]},
            }

            act(() => {
                mockWebSocket.simulateMessage(message)
            })

            expect(onPipelineEvent).toHaveBeenCalledWith('pipeline:queue-changed', message.data)
        })

        it('should call onRunCompleted on run:completed', async () => {
            const url = 'ws://localhost:3001'
            const onRunCompleted = vi.fn()

            renderHook(() => useWebSocket(url, {onRunCompleted}), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const message = {
                type: 'run:completed',
                data: {type: 'run-all', runId: '123'},
            }

            act(() => {
                mockWebSocket.simulateMessage(message)
            })

            expect(onRunCompleted).toHaveBeenCalledWith(message.data)
        })

        it('should call onRunCompleted on run:status', async () => {
            const url = 'ws://localhost:3001'
            const onRunCompleted = vi.fn()

            renderHook(() => useWebSocket(url, {onRunCompleted}), {
                wrapper: createWrapper(),
            })

            await act(async () => {
                await Promise.resolve()
            })

            const message = {
                type: 'run:status',
                data: {status: 'completed', runId: '123'},
            }

            act(() => {
                mockWebSocket.simulateMessage(message)
            })

            expect(onRunCompleted).toHaveBeenCalledWith(message.data)
        })
    })
})

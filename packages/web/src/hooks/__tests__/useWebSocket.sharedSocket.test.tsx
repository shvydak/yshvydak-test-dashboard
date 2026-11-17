import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {render, renderHook, act} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {QueryClientProvider} from '@tanstack/react-query'
import type {TestResult} from '@yshvydak/core'
import {queryClient} from '@config/queryClient'
import {useTestsStore} from '@features/tests/store/testsStore'
import Dashboard from '@features/dashboard/components/Dashboard'
import {TestDetailModal} from '@features/tests/components/testDetail'
import {getWebSocketUrl} from '@features/authentication/utils/webSocketUrl'
import {useWebSocket} from '../useWebSocket'

// Real store + real hook: App, Dashboard and the open detail modal each call useWebSocket.
// Only the data hooks of the two widgets are stubbed.
vi.mock('@features/tests/hooks/useTestStatusCounts', () => ({
    useTestStatusCounts: () => ({
        counts: {total: 0, passed: 0, failed: 0, skipped: 0, pending: 0, noted: 0},
        isLoading: false,
        error: null,
    }),
}))
vi.mock('@features/dashboard/hooks', () => ({
    useFlakyTests: () => ({
        data: [],
        isLoading: false,
        days: 7,
        threshold: 2,
        updateDays: vi.fn(),
        updateThreshold: vi.fn(),
    }),
    useTestTimeline: () => ({data: [], isLoading: false}),
}))
vi.mock('@features/dashboard/components/DashboardStats', () => ({DashboardStats: () => <div />}))
vi.mock('recharts', () => ({
    AreaChart: () => null,
    Area: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    ResponsiveContainer: () => null,
}))
vi.mock('@features/dashboard/hooks/useJiraSettings', () => ({
    useJiraSettings: () => ({settings: {baseUrl: '', chipAlignment: 'left', tagMode: 'tickets'}}),
}))
vi.mock('@features/tests/hooks/useTestExecutionHistory', () => ({
    useTestExecutionHistory: () => ({
        executions: [],
        total: 0,
        hasMore: false,
        loadMore: vi.fn(),
        loadingMore: false,
        loading: false,
        error: null,
        refetch: vi.fn(),
    }),
}))
vi.mock('@features/tests/hooks/useTestAttachments', () => ({
    useTestAttachments: () => ({attachments: [], loading: false, error: null, setError: vi.fn()}),
}))
vi.mock('@features/tests/components/testDetail/TestDetailHeader', () => ({
    TestDetailHeader: () => null,
}))
vi.mock('@features/tests/components/testDetail/TestDetailTabs', () => ({
    TestDetailTabs: () => null,
}))
vi.mock('@features/tests/components/testDetail/TestOverviewTab', () => ({
    TestOverviewTab: () => null,
}))
vi.mock('@features/tests/components/testDetail/TestStepsTab', () => ({TestStepsTab: () => null}))
vi.mock('@features/tests/components/history/ExecutionSidebar', () => ({
    ExecutionSidebar: () => null,
}))

const originalApplyRunSnapshot = useTestsStore.getState().applyRunSnapshot
const sockets: FakeWebSocket[] = []
class FakeWebSocket {
    static OPEN = 1
    readyState = 1
    onopen: any
    onmessage: any
    onclose: any
    onerror: any
    closed = false
    constructor(public url: string) {
        sockets.push(this)
        queueMicrotask(() => this.onopen?.())
    }
    send() {}
    close() {
        this.closed = true
    }
}

const emit = (type: string, data: unknown = {}) =>
    act(() => {
        sockets[sockets.length - 1].onmessage({data: JSON.stringify({type, data})})
    })

let requests: string[] = []
const listGets = () => requests.filter((u) => /\/tests\?/.test(u)).length
const runsGets = () => requests.filter((u) => /\/runs(\?|$)/.test(u)).length

const test: TestResult = {
    id: 'r1',
    testId: 'test-1',
    name: 'A test',
    filePath: 'a.spec.ts',
    status: 'passed',
    duration: 1,
    runId: 'run-1',
    project: 'Sanity',
    timestamp: '2026-09-01T10:00:00Z',
}

// What App.tsx's own useWebSocket call looks like
const AppSocket = ({onRunCompleted}: {onRunCompleted: () => void}) => {
    useWebSocket(getWebSocketUrl(true), {onRunCompleted})
    return null
}

function mountTab(onAppRunCompleted = vi.fn(), modalOpen = true) {
    const view = render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/dashboard']}>
                <AppSocket onRunCompleted={onAppRunCompleted} />
                <Dashboard />
                <TestDetailModal test={test} isOpen={modalOpen} onClose={vi.fn()} />
            </MemoryRouter>
        </QueryClientProvider>
    )
    return {view, onAppRunCompleted}
}

describe('one WebSocket per tab', () => {
    beforeEach(() => {
        sockets.length = 0
        requests = []
        window.scrollTo = vi.fn() as any
        localStorage.setItem('_auth', JSON.stringify({auth: {token: 't'}}))
        global.fetch = vi.fn(async (input: RequestInfo | URL) => {
            requests.push(String(input))
            // A non-empty list: Dashboard refetches on an empty one, which is not what is measured here
            const data = /\/tests\?/.test(String(input)) ? [test] : []
            return new Response(JSON.stringify({success: true, data}), {status: 200})
        }) as any
        ;(global as any).WebSocket = FakeWebSocket
        useTestsStore.setState({tests: [test], listProject: null, testsProject: null})
    })

    afterEach(() => {
        localStorage.clear()
        useTestsStore.setState({applyRunSnapshot: originalApplyRunSnapshot})
    })

    it('App + Dashboard + an open detail modal open a single socket', async () => {
        mountTab()
        await act(async () => {
            await Promise.resolve()
        })

        expect(sockets).toHaveLength(1)
        expect(sockets[0].closed).toBe(false)
    })

    it('opening and closing the modal never opens or closes a socket', async () => {
        const {view} = mountTab(vi.fn(), false)
        await act(async () => {
            await Promise.resolve()
        })
        expect(sockets).toHaveLength(1)

        view.rerender(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={['/dashboard']}>
                    <AppSocket onRunCompleted={vi.fn()} />
                    <Dashboard />
                    <TestDetailModal test={test} isOpen={true} onClose={vi.fn()} />
                </MemoryRouter>
            </QueryClientProvider>
        )
        await act(async () => {
            await Promise.resolve()
        })

        expect(sockets).toHaveLength(1)
        expect(sockets[0].closed).toBe(false)
    })

    it('one run:completed triggers one list reload and no /runs request', async () => {
        const {onAppRunCompleted} = mountTab()
        await act(async () => {
            await Promise.resolve()
        })
        requests = []

        emit('run:completed', {type: 'run-all'})
        await act(async () => {
            await Promise.resolve()
        })

        expect(listGets()).toBe(1)
        expect(runsGets()).toBe(0)
        expect(onAppRunCompleted).toHaveBeenCalledTimes(1)
    })

    it.each(['process:started', 'process:ended', 'discovery:completed'])(
        'one %s triggers one list reload',
        async (type) => {
            mountTab()
            await act(async () => {
                await Promise.resolve()
            })
            requests = []

            emit(type)
            await act(async () => {
                await Promise.resolve()
            })

            expect(listGets()).toBe(1)
            expect(runsGets()).toBe(0)
        }
    )

    it('one connection:status triggers one list reload and one snapshot application', async () => {
        const applyRunSnapshot = vi.fn()
        useTestsStore.setState({applyRunSnapshot})
        mountTab()
        await act(async () => {
            await Promise.resolve()
        })
        requests = []

        emit('connection:status', {activeRuns: [], isAnyProcessRunning: false})
        await act(async () => {
            await Promise.resolve()
        })

        expect(listGets()).toBe(1)
        expect(applyRunSnapshot).toHaveBeenCalledTimes(1)
    })

    it('every consumer still gets its callback once per event', () => {
        const dashboardOnly = vi.fn()
        const modalOnly = vi.fn()
        const a = renderHook(() => useWebSocket('ws://x', {onTestsDeleted: dashboardOnly}), {
            wrapper: ({children}) => (
                <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
            ),
        })
        const b = renderHook(() => useWebSocket('ws://x', {onTestsDeleted: modalOnly}), {
            wrapper: ({children}) => (
                <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
            ),
        })

        emit('tests:deleted', {scope: 'test', testId: 't'})

        expect(sockets).toHaveLength(1)
        expect(dashboardOnly).toHaveBeenCalledTimes(1)
        expect(modalOnly).toHaveBeenCalledTimes(1)
        a.unmount()
        b.unmount()
    })

    it('a throwing consumer does not skip the other consumers or the rest of the event', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        const after = vi.fn()
        const resultsChanged = vi.fn()
        const wrapper = ({children}: {children: React.ReactNode}) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        )
        const a = renderHook(
            () =>
                useWebSocket('ws://x', {
                    onTestsDeleted: () => {
                        throw new Error('consumer bug')
                    },
                    onResultsChanged: resultsChanged,
                }),
            {wrapper}
        )
        const b = renderHook(() => useWebSocket('ws://x', {onTestsDeleted: after}), {wrapper})

        emit('tests:deleted', {scope: 'test', testId: 't'})

        expect(after).toHaveBeenCalledTimes(1)
        expect(resultsChanged).toHaveBeenCalledTimes(1)
        expect(consoleError).toHaveBeenCalled()
        a.unmount()
        b.unmount()
        consoleError.mockRestore()
    })

    it('a store change never re-renders a component that hosts the hook', async () => {
        let renders = 0
        const host = renderHook(
            () => {
                renders++
                return useWebSocket('ws://x')
            },
            {
                wrapper: ({children}) => (
                    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
                ),
            }
        )
        await act(async () => {
            await Promise.resolve()
        })
        const settled = renders

        act(() => {
            useTestsStore.getState().clearProgress()
            useTestsStore.setState({tests: [test, {...test, id: 'r2', testId: 'test-2'}]})
            useTestsStore.getState().setTestRunning('r1', true)
        })

        expect(renders).toBe(settled)
        host.unmount()
    })

    it('the socket stays open while any consumer is mounted and closes with the last one', () => {
        const wrapper = ({children}: {children: React.ReactNode}) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        )
        const a = renderHook(() => useWebSocket('ws://x'), {wrapper})
        const b = renderHook(() => useWebSocket('ws://x'), {wrapper})

        b.unmount()
        expect(sockets[0].closed).toBe(false)
        a.unmount()
        expect(sockets[0].closed).toBe(true)
    })

    it('a dropped socket reconnects once for all consumers and re-reads the list once', async () => {
        vi.useFakeTimers()
        try {
            mountTab()
            await act(async () => {
                await Promise.resolve()
            })
            requests = []

            act(() => sockets[0].onclose())
            await act(async () => {
                vi.advanceTimersByTime(1000)
                await Promise.resolve()
            })
            // A fresh socket opened; its onopen follows in a microtask
            await act(async () => {
                await Promise.resolve()
            })

            expect(sockets).toHaveLength(2)
            expect(listGets()).toBe(1)
        } finally {
            vi.useRealTimers()
        }
    })
})

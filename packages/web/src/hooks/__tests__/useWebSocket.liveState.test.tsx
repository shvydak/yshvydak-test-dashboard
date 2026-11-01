import {describe, it, expect, vi, beforeEach} from 'vitest'
import {renderHook, act} from '@testing-library/react'
import {QueryClientProvider} from '@tanstack/react-query'
import {queryClient} from '@config/queryClient'
import {useTestsStore} from '@features/tests/store/testsStore'
import {useWebSocket} from '../useWebSocket'

// Real store here (the sibling suite mocks it): these tests check what ends up in it.
const sockets: FakeWebSocket[] = []
const lastSocket = () => sockets[sockets.length - 1] as any
class FakeWebSocket {
    static OPEN = 1
    readyState = 1
    onopen: any
    onmessage: any
    onclose: any
    onerror: any
    constructor(public url: string) {
        sockets.push(this)
        queueMicrotask(() => this.onopen?.())
    }
    send() {}
    close() {}
}

const wrapper = ({children}: {children: React.ReactNode}) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)
const send = (type: string, data: unknown) =>
    act(() => {
        lastSocket().onmessage({data: JSON.stringify({type, data})})
    })

async function connect(options?: Parameters<typeof useWebSocket>[1]) {
    const hook = renderHook(
        (props: {options?: typeof options}) => useWebSocket('ws://x', props.options),
        {
            initialProps: {options},
            wrapper,
        }
    )
    await act(async () => {
        await Promise.resolve()
    })
    return hook
}

describe('useWebSocket — snapshot is the truth on (re)connect', () => {
    beforeEach(() => {
        global.fetch = vi.fn(
            async () => new Response(JSON.stringify({success: true, data: []}), {status: 200})
        ) as any
        ;(global as any).WebSocket = FakeWebSocket
        useTestsStore.setState({
            runningGroups: new Set(['a.spec.ts']),
            runningTests: new Set(['exec-9']),
            isRunningAllTests: true,
            ciPipelineRunning: false,
            ciRunQueued: false,
            ciStopping: false,
            isDiscovering: false,
        })
    })

    it('an idle snapshot clears stale group and rerun spinners (run:completed was missed)', async () => {
        await connect()
        send('connection:status', {activeRuns: [], activeGroups: [], isAnyProcessRunning: false})
        const s = useTestsStore.getState()
        expect(s.runningGroups.size).toBe(0)
        expect(s.runningTests.size).toBe(0)
        expect(s.getIsAnyTestRunning()).toBe(false)
    })

    it('a busy snapshot replaces the sets: finished runs go, running ones stay', async () => {
        await connect()
        send('connection:status', {
            activeRuns: [
                {type: 'run-group', details: {filePath: 'b.spec.ts'}},
                {type: 'rerun', details: {originalTestId: 'exec-1'}},
            ],
            activeGroups: [],
            isAnyProcessRunning: true,
        })
        const s = useTestsStore.getState()
        expect([...s.runningGroups]).toEqual(['b.spec.ts'])
        expect([...s.runningTests]).toEqual(['exec-1'])
        expect(s.isRunningAllTests).toBe(false)
    })
})

describe('useWebSocket — callbacks are always the latest', () => {
    beforeEach(() => {
        global.fetch = vi.fn(
            async () => new Response(JSON.stringify({success: true, data: []}), {status: 200})
        ) as any
        ;(global as any).WebSocket = FakeWebSocket
    })

    it('an event after a re-render reaches the new callback, not the one from connect time', async () => {
        const first = vi.fn()
        const second = vi.fn()
        const {rerender} = await connect({onTestsDeleted: first})
        rerender({options: {onTestsDeleted: second}})
        send('tests:deleted', {scope: 'test', testId: 'B'})
        expect(second).toHaveBeenCalledTimes(1)
        expect(first).not.toHaveBeenCalled()
    })

    it('the same holds for run completion', async () => {
        const first = vi.fn()
        const second = vi.fn()
        const {rerender} = await connect({onRunCompleted: first})
        rerender({options: {onRunCompleted: second}})
        send('run:completed', {type: 'run-all'})
        expect(second).toHaveBeenCalledTimes(1)
        expect(first).not.toHaveBeenCalled()
    })
})

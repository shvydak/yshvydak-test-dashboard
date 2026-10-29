import {describe, it, expect, vi, beforeEach} from 'vitest'
import {StrictMode} from 'react'
import {renderHook, waitFor, act} from '@testing-library/react'
import {TestResult} from '@yshvydak/core'
import {useTestLink} from '../useTestLink'

const mockGet = vi.fn()
vi.mock('@/services/testLink.service', () => ({
    testLinkService: {getLatestByTestId: (id: string) => mockGet(id)},
}))

const row = (testId: string) => ({id: `r-${testId}`, testId}) as TestResult

describe('useTestLink', () => {
    const onResolved = vi.fn()
    const onFailed = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
        mockGet.mockImplementation(async (id: string) => row(id))
    })

    const setup = (initial: {testId: string | null; wait?: boolean}) =>
        renderHook(
            (p: {testId: string | null; wait?: boolean}) =>
                useTestLink({...p, onResolved, onFailed}),
            {
                initialProps: initial,
            }
        )

    it('resolves a change from one testId straight to another', async () => {
        const {rerender} = setup({testId: 'A'})
        await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1))
        rerender({testId: 'B'})
        await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(2))
        expect(onResolved).toHaveBeenLastCalledWith(expect.objectContaining({testId: 'B'}))
    })

    it('handles the same testId once across rerenders', async () => {
        const {rerender} = setup({testId: 'A'})
        await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1))
        rerender({testId: 'A'})
        rerender({testId: 'A'})
        expect(mockGet).toHaveBeenCalledTimes(1)
    })

    it('does nothing while waiting, then resolves once', async () => {
        const {rerender} = setup({testId: 'A', wait: true})
        expect(mockGet).not.toHaveBeenCalled()
        rerender({testId: 'A', wait: false})
        await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1))
        expect(mockGet).toHaveBeenCalledTimes(1)
    })

    it('uses a local hit without asking the server', () => {
        const local = row('A')
        renderHook(() => useTestLink({testId: 'A', findLocal: () => local, onResolved, onFailed}))
        expect(onResolved).toHaveBeenCalledWith(local)
        expect(mockGet).not.toHaveBeenCalled()
    })

    it('reports not-found and error separately', async () => {
        mockGet.mockResolvedValueOnce(null)
        const {rerender} = setup({testId: 'gone'})
        await waitFor(() => expect(onFailed).toHaveBeenLastCalledWith('not-found'))
        mockGet.mockRejectedValueOnce(new Error('down'))
        rerender({testId: 'other'})
        await waitFor(() => expect(onFailed).toHaveBeenLastCalledWith('error'))
    })

    it('drops a result that arrives after unmount', async () => {
        let resolve!: (t: TestResult) => void
        mockGet.mockReturnValue(new Promise<TestResult>((r) => (resolve = r)))
        const {unmount} = setup({testId: 'A'})
        unmount()
        await act(async () => resolve(row('A')))
        expect(onResolved).not.toHaveBeenCalled()
    })

    it('drops a stale result when the URL moved to another testId', async () => {
        let resolveA!: (t: TestResult) => void
        mockGet.mockImplementation((id: string) =>
            id === 'A' ? new Promise<TestResult>((r) => (resolveA = r)) : Promise.resolve(row(id))
        )
        const {rerender} = setup({testId: 'A'})
        rerender({testId: 'B'})
        await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1))
        await act(async () => resolveA(row('A')))
        expect(onResolved).toHaveBeenCalledTimes(1)
        expect(onResolved).toHaveBeenCalledWith(expect.objectContaining({testId: 'B'}))
    })

    it('opens the same testId again after the link was cleared', async () => {
        const {rerender} = setup({testId: 'A'})
        await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1))
        rerender({testId: null})
        rerender({testId: 'A'})
        await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(2))
    })

    it('makes one request and one resolve under StrictMode', async () => {
        renderHook(() => useTestLink({testId: 'A', onResolved, onFailed}), {wrapper: StrictMode})
        await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1))
        expect(mockGet).toHaveBeenCalledTimes(1)
    })

    it('resolves A once for A -> B -> A while the first A lookup is running', async () => {
        const pending: Array<(t: TestResult) => void> = []
        mockGet.mockImplementation((id: string) =>
            id === 'A' ? new Promise<TestResult>((r) => pending.push(r)) : Promise.resolve(row(id))
        )
        const {rerender} = setup({testId: 'A'})
        rerender({testId: 'B'})
        await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1))
        rerender({testId: 'A'})
        await waitFor(() => expect(pending).toHaveLength(2))
        await act(async () => pending.forEach((r) => r(row('A'))))
        const resolvedA = onResolved.mock.calls.filter(([t]) => t.testId === 'A')
        expect(resolvedA).toHaveLength(1)
    })

    it('drops a pending lookup when the link is cleared', async () => {
        let resolve!: (t: TestResult) => void
        mockGet.mockReturnValue(new Promise<TestResult>((r) => (resolve = r)))
        const {rerender} = setup({testId: 'A'})
        rerender({testId: null})
        await act(async () => resolve(row('A')))
        expect(onResolved).not.toHaveBeenCalled()
    })

    it('drops a pending lookup when a local hit opens another test', async () => {
        let resolve!: (t: TestResult) => void
        mockGet.mockReturnValue(new Promise<TestResult>((r) => (resolve = r)))
        const localB = row('B')
        const {rerender} = renderHook(
            (p: {testId: string}) =>
                useTestLink({
                    testId: p.testId,
                    findLocal: (id) => (id === 'B' ? localB : undefined),
                    onResolved,
                    onFailed,
                }),
            {initialProps: {testId: 'A'}}
        )
        rerender({testId: 'B'})
        await act(async () => resolve(row('A')))
        expect(onResolved).toHaveBeenCalledTimes(1)
        expect(onResolved).toHaveBeenCalledWith(localB)
    })

    it('drops a pending lookup when the link changes while waiting', async () => {
        let resolve!: (t: TestResult) => void
        mockGet.mockReturnValue(new Promise<TestResult>((r) => (resolve = r)))
        const {rerender} = setup({testId: 'A'})
        rerender({testId: 'B', wait: true})
        await act(async () => resolve(row('A')))
        expect(onResolved).not.toHaveBeenCalled()
    })
})

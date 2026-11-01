import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'

vi.mock('@/hooks/useProjectTabs', () => ({
    getProjectWorkersOverride: vi.fn(() => undefined),
}))
vi.mock('@/hooks/useAutoDiscoverSetting', () => ({
    getAutoDiscoverFromStorage: vi.fn(() => false),
}))
vi.mock('@features/authentication/utils/authFetch', () => ({
    authGet: vi.fn(),
    authPost: vi.fn(),
    authDelete: vi.fn(),
}))

import {getProjectWorkersOverride} from '@/hooks/useProjectTabs'
import {authGet, authPost} from '@features/authentication/utils/authFetch'
import {useTestsStore, RUN_START_GRACE_MS} from '../testsStore'

const mockAuthGet = authGet as ReturnType<typeof vi.fn>
const mockAuthPost = authPost as ReturnType<typeof vi.fn>
const mockWorkers = getProjectWorkersOverride as ReturnType<typeof vi.fn>

const json = (body: unknown, ok = true) =>
    ({ok, status: ok ? 200 : 500, json: () => Promise.resolve(body)}) as unknown as Response

const row = {id: 'exec-1', testId: 'tid-1', project: 'P', name: 'n', filePath: 'f'} as any

describe('testsStore.rerunTest — per-tab Workers setting', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockAuthPost.mockResolvedValue(json({success: true}))
        mockAuthGet.mockResolvedValue(json({success: true, data: []}))
        useTestsStore.setState({tests: [row], runningTests: new Set(), actionError: null})
    })

    it('resolves the project from the execution id a row passes', async () => {
        await useTestsStore.getState().rerunTest('exec-1')
        expect(mockWorkers).toHaveBeenCalledWith('P')
    })

    it('an explicit project wins when the execution is not in the list', async () => {
        await useTestsStore.getState().rerunTest('older-execution', 'Q')
        expect(mockWorkers).toHaveBeenCalledWith('Q')
    })

    it('posts to the execution id and marks that id running', async () => {
        await useTestsStore.getState().rerunTest('exec-1')
        expect(mockAuthPost.mock.calls[0][0]).toContain('/tests/exec-1/rerun')
        expect(useTestsStore.getState().runningTests.has('exec-1')).toBe(true)
    })
})

describe('testsStore.applyRunSnapshot', () => {
    it('replaces every running flag, not just adds to them', () => {
        useTestsStore.setState({
            isRunningAllTests: true,
            runningTests: new Set(['stale-exec']),
            runningGroups: new Set(['stale.spec.ts']),
        })
        useTestsStore
            .getState()
            .applyRunSnapshot({isRunningAll: false, testIds: ['e2'], filePaths: ['b.spec.ts']})
        const s = useTestsStore.getState()
        expect(s.isRunningAllTests).toBe(false)
        expect([...s.runningTests]).toEqual(['e2'])
        expect([...s.runningGroups]).toEqual(['b.spec.ts'])
    })

    describe('a Run click just before the snapshot', () => {
        beforeEach(() => {
            vi.useFakeTimers()
            useTestsStore.getState().resetRunState() // also forgets click marks of earlier tests
            useTestsStore.setState({
                isRunningAllTests: false,
                runningTests: new Set(),
                runningGroups: new Set(),
            })
        })
        afterEach(() => vi.useRealTimers())

        const idle = {isRunningAll: false, testIds: [], filePaths: []}

        it('keeps the optimistic flags until the server can know about them', () => {
            const s = useTestsStore.getState()
            s.setTestRunning('e1', true)
            s.setGroupRunning('a.spec.ts', true)
            s.setRunningAllTests(true)
            s.applyRunSnapshot(idle)
            const after = useTestsStore.getState()
            expect(after.runningTests.has('e1')).toBe(true)
            expect(after.runningGroups.has('a.spec.ts')).toBe(true)
            expect(after.isRunningAllTests).toBe(true)
        })

        it('drops them once the grace window has passed (a missed run:completed)', () => {
            const s = useTestsStore.getState()
            s.setTestRunning('e1', true)
            s.setGroupRunning('a.spec.ts', true)
            s.setRunningAllTests(true)
            vi.advanceTimersByTime(RUN_START_GRACE_MS + 1)
            s.applyRunSnapshot(idle)
            expect(useTestsStore.getState().getIsAnyTestRunning()).toBe(false)
        })

        it('a flag cleared by run:completed is not resurrected by a snapshot that still lists it', () => {
            const s = useTestsStore.getState()
            s.setTestRunning('e1', true)
            s.setTestRunning('e1', false) // run:completed
            s.applyRunSnapshot({...idle, testIds: ['e1']}) // a snapshot taken just before it ended
            s.applyRunSnapshot(idle)
            expect(useTestsStore.getState().runningTests.size).toBe(0)
        })

        it('a real Run-all click keeps its flag through an idle snapshot, then clears it with its run id', async () => {
            mockAuthPost.mockResolvedValue(json({success: true, data: {runId: 'r1'}}))
            mockAuthGet.mockResolvedValue(json({success: true, data: []}))
            await useTestsStore.getState().runAllTests()
            expect(useTestsStore.getState().isRunningAllTests).toBe(true)
            expect(useTestsStore.getState().currentRunAllId).toBe('r1')

            useTestsStore.getState().applyRunSnapshot(idle)
            expect(useTestsStore.getState().isRunningAllTests).toBe(true)

            vi.advanceTimersByTime(RUN_START_GRACE_MS + 1)
            useTestsStore.getState().applyRunSnapshot(idle)
            expect(useTestsStore.getState().isRunningAllTests).toBe(false)
            expect(useTestsStore.getState().currentRunAllId).toBeNull()
        })

        it('an idle snapshot inside the grace is re-applied once the grace ends (run:completed lost)', () => {
            const s = useTestsStore.getState()
            s.setTestRunning('e1', true)
            s.setGroupRunning('a.spec.ts', true)
            s.setRunningAllTests(true)
            vi.advanceTimersByTime(2000)
            s.applyRunSnapshot(idle) // kept: the click is only 2 s old
            expect(useTestsStore.getState().getIsAnyTestRunning()).toBe(true)

            vi.advanceTimersByTime(RUN_START_GRACE_MS)
            expect(useTestsStore.getState().getIsAnyTestRunning()).toBe(false)
        })

        it('run:cancelled (resetRunState) cancels the pending re-check', async () => {
            mockAuthPost.mockResolvedValue(json({success: true}))
            mockAuthGet.mockResolvedValue(json({success: true, data: []}))
            await useTestsStore.getState().rerunTest('e1')
            useTestsStore.getState().applyRunSnapshot({...idle, testIds: ['e1']})
            useTestsStore.getState().resetRunState()

            vi.advanceTimersByTime(RUN_START_GRACE_MS + 10)

            expect(useTestsStore.getState().runningTests.size).toBe(0)
        })

        it('two clicks 3 s apart: each flag ends at its own grace end', () => {
            const s = useTestsStore.getState()
            s.setTestRunning('e1', true)
            vi.advanceTimersByTime(3000)
            s.setTestRunning('e2', true)
            s.applyRunSnapshot(idle)

            vi.advanceTimersByTime(RUN_START_GRACE_MS - 3000 + 10) // e1's grace is over, e2's is not
            expect([...useTestsStore.getState().runningTests]).toEqual(['e2'])

            vi.advanceTimersByTime(3000)
            expect(useTestsStore.getState().runningTests.size).toBe(0)
        })

        it('keeps one re-check timer however many snapshots arrive, and none after a reset', () => {
            const s = useTestsStore.getState()
            s.setTestRunning('e1', true)
            s.applyRunSnapshot(idle)
            s.applyRunSnapshot(idle)
            s.applyRunSnapshot(idle)
            expect(vi.getTimerCount()).toBe(1)

            s.resetRunState()
            expect(vi.getTimerCount()).toBe(0)
        })

        it('the re-check uses the latest snapshot, not the first one', () => {
            const s = useTestsStore.getState()
            s.setTestRunning('e1', true)
            s.applyRunSnapshot(idle)
            s.applyRunSnapshot({...idle, testIds: ['e1']}) // the server now lists it
            vi.advanceTimersByTime(RUN_START_GRACE_MS + 100)
            expect(useTestsStore.getState().runningTests.has('e1')).toBe(true)
        })
    })

    it('an empty snapshot leaves nothing running', () => {
        useTestsStore.setState({
            runningTests: new Set(['x']),
            runningGroups: new Set(['y']),
            ciPipelineRunning: false,
            ciRunQueued: false,
            ciStopping: false,
            isDiscovering: false,
        })
        useTestsStore.getState().applyRunSnapshot({isRunningAll: false, testIds: [], filePaths: []})
        expect(useTestsStore.getState().getIsAnyTestRunning()).toBe(false)
    })
})

describe('testsStore.fetchTests — isLoading after a dropped stale reply', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        useTestsStore.setState({
            tests: [],
            error: null,
            isLoading: false,
            listProject: 'A',
            runningTests: new Set(),
            runningGroups: new Set(),
            isRunningAllTests: false,
            isDiscovering: false,
        })
    })

    it('does not stay true when a run starts during a tab switch', async () => {
        let resolveA: (r: Response) => void = () => {}
        mockAuthGet.mockReturnValueOnce(new Promise<Response>((r) => (resolveA = r)))
        const fetchA = useTestsStore.getState().fetchTests() // sets isLoading, never finishes first
        expect(useTestsStore.getState().isLoading).toBe(true)

        // User switches to tab B and a run starts: B's fetch must not copy A's `true`
        useTestsStore.setState({listProject: 'B', runningTests: new Set(['e1'])})
        mockAuthGet.mockResolvedValueOnce(json({success: true, data: []}))
        await useTestsStore.getState().fetchTests()

        resolveA(json({success: true, data: []})) // dropped as stale
        await fetchA

        expect(useTestsStore.getState().isLoading).toBe(false)
    })

    it('a failed fetch also ends loading', async () => {
        useTestsStore.setState({runningTests: new Set(['e1']), isLoading: true})
        mockAuthGet.mockResolvedValueOnce(json(null, false))
        await useTestsStore.getState().fetchTests()
        expect(useTestsStore.getState().isLoading).toBe(false)
    })
})

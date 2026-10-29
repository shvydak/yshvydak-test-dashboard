import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import type {LiveTestResult, TestResult} from '@yshvydak/core'
import {useTestsStore, LIVE_COUNTS_REFRESH_DELAY_MS, resetLiveCountsTimer} from '../testsStore'
import {queryClient} from '@config/queryClient'

vi.mock('@features/authentication/utils/authFetch', () => ({
    authGet: vi.fn(),
    authPost: vi.fn(),
    authDelete: vi.fn(),
}))

const row = (testId: string, over: Partial<TestResult> = {}): TestResult => ({
    id: `old-${testId}`,
    testId,
    name: testId,
    filePath: 'a.spec.ts',
    status: 'pending',
    duration: 0,
    runId: 'old-run',
    project: 'WEB',
    metadata: {tags: ['@smoke']} as TestResult['metadata'],
    notInCode: true,
    ...over,
})

const live = (testId: string, over: Partial<LiveTestResult> = {}): LiveTestResult => ({
    id: `new-${testId}`,
    testId,
    runId: 'run-1',
    name: testId,
    filePath: 'a.spec.ts',
    status: 'failed',
    duration: 120,
    errorMessage: 'boom',
    timestamp: '2026-01-01T00:00:00.000Z',
    project: 'WEB',
    ...over,
})

describe('testsStore.applyLiveResult', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        resetLiveCountsTimer()
        queryClient.clear()
        useTestsStore.setState({tests: [row('t1'), row('t2')], listProject: 'WEB'})
    })
    afterEach(() => vi.useRealTimers())

    it('patches the result fields of the row and keeps tags and notInCode', () => {
        expect(useTestsStore.getState().applyLiveResult(live('t1'))).toBe(true)

        const [t1, t2] = useTestsStore.getState().tests
        expect(t1).toMatchObject({
            id: 'new-t1',
            status: 'failed',
            duration: 120,
            errorMessage: 'boom',
            runId: 'run-1',
            notInCode: true,
        })
        expect(t1.metadata).toEqual({tags: ['@smoke']})
        expect(t2.status).toBe('pending')
    })

    it('ignores the list of another project but still refreshes counts', () => {
        const spy = vi.spyOn(queryClient, 'invalidateQueries')

        const handled = useTestsStore.getState().applyLiveResult(live('t1', {project: 'MOBILE'}))

        expect(handled).toBe(true)
        expect(useTestsStore.getState().tests[0].status).toBe('pending')
        vi.advanceTimersByTime(LIVE_COUNTS_REFRESH_DELAY_MS)
        expect(spy).toHaveBeenCalledWith({queryKey: ['test-status-counts']})
    })

    it('returns false for a test missing from the list (caller reloads)', () => {
        expect(useTestsStore.getState().applyLiveResult(live('new-test'))).toBe(false)
        expect(useTestsStore.getState().tests).toHaveLength(2)
    })

    it('refreshes only the count queries, once per burst, never the list', () => {
        const spy = vi.spyOn(queryClient, 'invalidateQueries')
        const {applyLiveResult} = useTestsStore.getState()

        applyLiveResult(live('t1'))
        applyLiveResult(live('t2'))
        expect(spy).not.toHaveBeenCalled()

        vi.advanceTimersByTime(LIVE_COUNTS_REFRESH_DELAY_MS)
        expect(spy).toHaveBeenCalledTimes(2)
        expect(spy).toHaveBeenCalledWith({queryKey: ['project-status-summary']})
        expect(spy).toHaveBeenCalledWith({queryKey: ['test-status-counts']})
        expect(spy).not.toHaveBeenCalledWith({queryKey: ['filtered-tests-by-status']})
    })

    it('an older result arriving after a newer one leaves the row unchanged', () => {
        useTestsStore.setState({
            tests: [row('t1', {status: 'passed', timestamp: '2026-01-01T00:00:10.000Z'})],
        })
        const spy = vi.spyOn(queryClient, 'invalidateQueries')

        const handled = useTestsStore
            .getState()
            .applyLiveResult(live('t1', {status: 'failed', timestamp: '2026-01-01T00:00:05.000Z'}))

        expect(handled).toBe(true)
        expect(useTestsStore.getState().tests[0].status).toBe('passed')
        vi.advanceTimersByTime(LIVE_COUNTS_REFRESH_DELAY_MS)
        expect(spy).toHaveBeenCalledWith({queryKey: ['test-status-counts']})
    })

    it('a result with an empty project keeps the row project', () => {
        useTestsStore.setState({listProject: null})

        useTestsStore.getState().applyLiveResult(live('t1', {project: ''}))

        expect(useTestsStore.getState().tests[0]).toMatchObject({status: 'failed', project: 'WEB'})
    })

    describe('hidden tab', () => {
        const setHidden = (hidden: boolean) => {
            Object.defineProperty(document, 'hidden', {configurable: true, value: hidden})
            document.dispatchEvent(new Event('visibilitychange'))
        }
        afterEach(() => setHidden(false))

        it('skips the count refresh while hidden, then refreshes once when visible again', () => {
            const spy = vi.spyOn(queryClient, 'invalidateQueries')
            setHidden(true)

            useTestsStore.getState().applyLiveResult(live('t1'))
            vi.advanceTimersByTime(LIVE_COUNTS_REFRESH_DELAY_MS * 3)
            expect(spy).not.toHaveBeenCalled()

            setHidden(false)
            expect(spy).toHaveBeenCalledTimes(2)
            expect(spy).toHaveBeenCalledWith({queryKey: ['test-status-counts']})

            // the catch-up flag is cleared: hiding and showing again refreshes nothing more
            setHidden(true)
            setHidden(false)
            expect(spy).toHaveBeenCalledTimes(2)
        })

        it('does not refresh on becoming visible when nothing arrived while hidden', () => {
            const spy = vi.spyOn(queryClient, 'invalidateQueries')
            setHidden(true)
            setHidden(false)
            expect(spy).not.toHaveBeenCalled()
        })
    })

    describe('status-filtered lists', () => {
        it('removes the row from a list whose filter no longer matches', () => {
            queryClient.setQueryData(
                ['filtered-tests-by-status', 'pending', 'WEB'],
                [row('t1'), row('t2')]
            )

            useTestsStore.getState().applyLiveResult(live('t1', {status: 'failed'}))

            const list = queryClient.getQueryData<TestResult[]>([
                'filtered-tests-by-status',
                'pending',
                'WEB',
            ])
            expect(list?.map((t) => t.testId)).toEqual(['t2'])
        })

        it('adds the patched row to the list it now matches', () => {
            queryClient.setQueryData(
                ['filtered-tests-by-status', 'failed', 'WEB'],
                [row('t2', {status: 'failed'})]
            )

            useTestsStore.getState().applyLiveResult(live('t1', {status: 'failed'}))

            const list = queryClient.getQueryData<TestResult[]>([
                'filtered-tests-by-status',
                'failed',
                'WEB',
            ])
            expect(list?.map((t) => t.testId)).toEqual(['t1', 't2'])
            expect(list?.[0].metadata).toEqual({tags: ['@smoke']})
        })

        it('patches a matching row in place', () => {
            queryClient.setQueryData(
                ['filtered-tests-by-status', 'failed', 'WEB'],
                [row('t1', {status: 'failed'})]
            )

            useTestsStore.getState().applyLiveResult(live('t1', {status: 'failed', duration: 999}))

            const list = queryClient.getQueryData<TestResult[]>([
                'filtered-tests-by-status',
                'failed',
                'WEB',
            ])
            expect(list).toHaveLength(1)
            expect(list?.[0].duration).toBe(999)
        })

        it('leaves lists of another project untouched', () => {
            const other = [row('t1', {project: 'MOBILE'})]
            queryClient.setQueryData(['filtered-tests-by-status', 'pending', 'MOBILE'], other)

            useTestsStore.getState().applyLiveResult(live('t1', {status: 'failed'}))

            expect(
                queryClient.getQueryData(['filtered-tests-by-status', 'pending', 'MOBILE'])
            ).toBe(other)
        })

        it('keeps the row in a noted list after a status change and patches it', () => {
            queryClient.setQueryData(
                ['filtered-tests-by-status', 'noted', 'WEB'],
                [row('t1', {status: 'pending'})]
            )

            useTestsStore.getState().applyLiveResult(live('t1', {status: 'failed'}))

            const list = queryClient.getQueryData<TestResult[]>([
                'filtered-tests-by-status',
                'noted',
                'WEB',
            ])
            expect(list).toHaveLength(1)
            expect(list?.[0].status).toBe('failed')
        })

        it('invalidates exactly the list the row now matches when the store has no row', () => {
            // another project's tab is active, so the store holds no row for this result
            useTestsStore.setState({listProject: 'MOBILE', tests: []})
            const failedKey = ['filtered-tests-by-status', 'failed', 'WEB']
            queryClient.setQueryData(failedKey, [row('t2', {status: 'failed'})])
            queryClient.setQueryData(['filtered-tests-by-status', 'skipped', 'WEB'], [])
            const spy = vi.spyOn(queryClient, 'invalidateQueries')

            useTestsStore.getState().applyLiveResult(live('t1', {status: 'failed'}))

            expect(spy).toHaveBeenCalledWith({queryKey: failedKey, exact: true})
            expect(spy).not.toHaveBeenCalledWith({
                queryKey: ['filtered-tests-by-status', 'skipped', 'WEB'],
                exact: true,
            })
        })
    })
})

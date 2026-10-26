import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {TestResult} from '@yshvydak/core'
import {TestDetailModal} from '../TestDetailModal'

const refetchHistory = vi.fn()
const selectExecution = vi.fn()
const onClose = vi.fn()
let wsOptions: any

vi.mock('../../../../../hooks/useWebSocket', () => ({
    useWebSocket: (_url: string | null, options: any) => {
        wsOptions = options
        return {isConnected: true}
    },
}))
vi.mock('@features/authentication/utils', () => ({getWebSocketUrl: () => 'ws://x'}))
vi.mock('@features/dashboard/hooks/useJiraSettings', () => ({
    useJiraSettings: () => ({settings: {tagMode: 'tickets'}}),
}))
vi.mock('../../../hooks/useTestAttachments', () => ({
    useTestAttachments: () => ({attachments: [], loading: false, error: null, setError: vi.fn()}),
}))
vi.mock('../../../hooks/useTestExecutionHistory', () => ({
    useTestExecutionHistory: () => ({
        executions: [],
        total: 0,
        hasMore: false,
        loadMore: vi.fn(),
        loadingMore: false,
        loading: false,
        error: null,
        refetch: refetchHistory,
    }),
}))
vi.mock('../../../store/testsStore', () => ({
    useTestsStore: (selector: (s: any) => unknown) =>
        selector({
            selectedExecutionId: null,
            selectExecution,
            rerunTest: vi.fn(),
            deleteTest: vi.fn(),
            deleteExecution: vi.fn(),
            runningTests: new Set(),
            getIsAnyTestRunning: () => false,
            activeProgress: null,
        }),
}))
vi.mock('../TestDetailHeader', () => ({TestDetailHeader: () => null}))
vi.mock('../TestDetailTabs', () => ({TestDetailTabs: () => null}))
vi.mock('../TestOverviewTab', () => ({TestOverviewTab: () => null}))
vi.mock('../TestStepsTab', () => ({TestStepsTab: () => null}))
vi.mock('../../history/ExecutionSidebar', () => ({ExecutionSidebar: () => null}))

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

describe('TestDetailModal — history refresh while open', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        render(
            <QueryClientProvider client={new QueryClient()}>
                <TestDetailModal test={test} isOpen={true} onClose={onClose} />
            </QueryClientProvider>
        )
    })

    it("refetches history when this file's group run completes (not a rerun)", () => {
        wsOptions.onRunCompleted({type: 'run-group', filePath: 'a.spec.ts'})

        expect(refetchHistory).toHaveBeenCalledTimes(1)
        expect(selectExecution).not.toHaveBeenCalled()
    })

    it('ignores a group run of another file and a rerun of another test', () => {
        wsOptions.onRunCompleted({type: 'run-group', filePath: 'other.spec.ts'})
        wsOptions.onRunCompleted({isRerun: true, testId: 'other-test'})

        expect(refetchHistory).not.toHaveBeenCalled()
    })

    it('refetches on a run with no usable payload (background refetch keeps the list)', () => {
        wsOptions.onRunCompleted(undefined)
        wsOptions.onRunCompleted({runId: 'r9'})

        expect(refetchHistory).toHaveBeenCalledTimes(2)
        expect(selectExecution).not.toHaveBeenCalled()
    })

    it('refetches history on a run-all completion', () => {
        wsOptions.onRunCompleted({type: 'run-all'})

        expect(refetchHistory).toHaveBeenCalledTimes(1)
    })

    it('rerun of this test refetches and jumps to the latest execution', () => {
        wsOptions.onRunCompleted({isRerun: true, testId: 'test-1'})

        expect(refetchHistory).toHaveBeenCalledTimes(1)
        expect(selectExecution).toHaveBeenCalledWith(null)
    })

    it('refetches history when an execution is deleted elsewhere', () => {
        wsOptions.onTestsDeleted({scope: 'execution', executionId: 'e1'})

        expect(refetchHistory).toHaveBeenCalledTimes(1)
        expect(onClose).not.toHaveBeenCalled()
    })

    it.each([
        [{scope: 'test', testId: 'test-1'}],
        [{scope: 'all'}],
        [{scope: 'project', project: 'Sanity'}],
    ])('closes when this test is deleted elsewhere: %o', (payload) => {
        wsOptions.onTestsDeleted(payload)

        expect(onClose).toHaveBeenCalledTimes(1)
        expect(refetchHistory).not.toHaveBeenCalled()
    })

    it('stays open when another test or project is deleted', () => {
        wsOptions.onTestsDeleted({scope: 'test', testId: 'other'})
        wsOptions.onTestsDeleted({scope: 'project', project: 'Elsewhere'})

        expect(onClose).not.toHaveBeenCalled()
    })
})

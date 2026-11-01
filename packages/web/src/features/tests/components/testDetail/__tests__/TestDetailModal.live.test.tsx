import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent, act} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {TestResult} from '@yshvydak/core'
import {TestDetailModal} from '../TestDetailModal'

const fetchTests = vi.fn()
const selectExecution = vi.fn()
const rerunTest = vi.fn()
const saveNote = vi.fn()
const deleteNote = vi.fn()

vi.mock('../../../../../hooks/useWebSocket', () => ({
    useWebSocket: () => ({isConnected: true}),
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
        refetch: vi.fn(),
    }),
}))
vi.mock('../../../store/testsStore', () => ({
    useTestsStore: (selector: (s: any) => unknown) =>
        selector({
            selectedExecutionId: null,
            selectExecution,
            fetchTests,
            rerunTest,
            deleteTest: vi.fn(),
            deleteExecution: vi.fn(),
            runningTests: new Set(),
            getIsAnyTestRunning: () => false,
            activeProgress: null,
        }),
}))
vi.mock('../../../../../services/note.service', () => ({
    noteService: {
        saveNote: (...args: unknown[]) => saveNote(...args),
        deleteNote: (...args: unknown[]) => deleteNote(...args),
    },
}))
vi.mock('../TestDetailHeader', () => ({TestDetailHeader: () => null}))
vi.mock('../TestDetailTabs', () => ({TestDetailTabs: () => null}))
vi.mock('../TestStepsTab', () => ({TestStepsTab: () => null}))
vi.mock('../TestOverviewTab', () => ({
    TestOverviewTab: (props: any) => (
        <>
            <button onClick={() => props.onSaveNote('n')}>save-note</button>
            <button onClick={() => props.onDeleteNote()}>delete-note</button>
        </>
    ),
}))
vi.mock('../../history/ExecutionSidebar', () => ({
    ExecutionSidebar: (props: any) => (
        <button onClick={() => props.onRerun('older-execution')}>sidebar-run</button>
    ),
}))

const makeTest = (testId: string): TestResult => ({
    id: `exec-${testId}`,
    testId,
    name: 'A test',
    filePath: 'a.spec.ts',
    status: 'passed',
    duration: 1,
    runId: 'run-1',
    project: 'Sanity',
    timestamp: '2026-09-01T10:00:00Z',
})

function renderModal(test: TestResult) {
    const tree = (t: TestResult) => (
        <QueryClientProvider client={new QueryClient()}>
            <TestDetailModal test={t} isOpen={true} onClose={vi.fn()} />
        </QueryClientProvider>
    )
    const view = render(tree(test))
    return {rerenderWith: (t: TestResult) => view.rerender(tree(t))}
}

describe('TestDetailModal — live state', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        saveNote.mockResolvedValue(undefined)
        deleteNote.mockResolvedValue(undefined)
    })

    it('saving a note refreshes the store list so the row preview updates', async () => {
        renderModal(makeTest('t1'))
        await act(async () => fireEvent.click(screen.getByText('save-note')))
        expect(fetchTests).toHaveBeenCalledTimes(1)
    })

    it('deleting a note refreshes the store list', async () => {
        renderModal(makeTest('t1'))
        await act(async () => fireEvent.click(screen.getByText('delete-note')))
        expect(fetchTests).toHaveBeenCalledTimes(1)
    })

    it("rerun from the sidebar passes the test's project (an older execution is not in the list)", async () => {
        renderModal(makeTest('t1'))
        await act(async () => fireEvent.click(screen.getByText('sidebar-run')))
        expect(rerunTest).toHaveBeenCalledWith('older-execution', 'Sanity')
    })

    it('switching to another test while open drops the picked execution', () => {
        const {rerenderWith} = renderModal(makeTest('t1'))
        expect(selectExecution).not.toHaveBeenCalled()
        rerenderWith(makeTest('t2'))
        expect(selectExecution).toHaveBeenCalledWith(null)
    })
})

import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {useState} from 'react'
import {TestResult} from '@yshvydak/core'
import {TestDetailModal} from '../TestDetailModal'
import {TestNoteEditor} from '../TestNoteEditor'
import {NoteImageLightbox} from '../NoteImageLightbox'

const onClose = vi.fn()
const onNoteDirtyChange = vi.fn()

vi.mock('../../../../../hooks/useWebSocket', () => ({
    useWebSocket: () => ({isConnected: true}),
}))
vi.mock('@features/authentication/utils', () => ({getWebSocketUrl: () => 'ws://x'}))
vi.mock('@features/authentication/utils/authFetch', () => ({
    createProtectedFileURL: vi.fn(async () => 'blob:x'),
}))
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
vi.mock('../../../hooks/useNoteImages', () => ({
    useNoteImages: () => ({images: [], loading: false, error: null, refetch: vi.fn()}),
}))
vi.mock('../../../store/testsStore', () => ({
    useTestsStore: (selector: (s: any) => unknown) =>
        selector({
            selectedExecutionId: null,
            selectExecution: vi.fn(),
            rerunTest: vi.fn(),
            deleteTest: vi.fn(),
            deleteExecution: vi.fn(),
            runningTests: new Set(),
            getIsAnyTestRunning: () => false,
            activeProgress: null,
        }),
}))
vi.mock('../TestDetailHeader', () => ({
    TestDetailHeader: ({onClose}: {onClose: () => void}) => (
        <button onClick={onClose}>close-x</button>
    ),
}))
vi.mock('../TestDetailTabs', () => ({
    TestDetailTabs: ({onTabChange}: {onTabChange: (t: string) => void}) => (
        <>
            <button onClick={() => onTabChange('steps')}>steps-tab</button>
            <button onClick={() => onTabChange('overview')}>overview-tab</button>
        </>
    ),
}))
vi.mock('../TestStepsTab', () => ({TestStepsTab: () => <div>steps content</div>}))
vi.mock('../../history/ExecutionSidebar', () => ({ExecutionSidebar: () => null}))
// The overview tab hosts the real note editor and a real lightbox, as in the app
vi.mock('../TestOverviewTab', () => ({
    TestOverviewTab: ({onNoteDirtyChange}: {onNoteDirtyChange?: (d: boolean) => void}) => {
        const [open, setOpen] = useState(false)
        return (
            <div>
                <TestNoteEditor
                    testId="test-1"
                    initialNote="saved note"
                    onSave={vi.fn()}
                    onDelete={vi.fn()}
                    onDirtyChange={onNoteDirtyChange}
                />
                <button onClick={() => setOpen(true)}>open image</button>
                <NoteImageLightbox
                    isOpen={open}
                    onClose={() => setOpen(false)}
                    image={{id: 'i1', url: '/i1', filename: 'i1.png'} as any}
                />
            </div>
        )
    },
}))

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

describe('TestDetailModal - Escape closes only the top layer', () => {
    beforeEach(() => {
        onClose.mockClear()
        window.scrollTo = vi.fn()
        render(
            <QueryClientProvider client={new QueryClient()}>
                <TestDetailModal test={test} isOpen={true} onClose={onClose} />
            </QueryClientProvider>
        )
    })

    it('Esc in the note editor keeps the modal open and the unsaved draft', () => {
        fireEvent.click(screen.getByText('saved note'))
        const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
        fireEvent.change(textarea, {target: {value: 'my unsaved draft'}})

        fireEvent.keyDown(textarea, {key: 'Escape'})

        expect(onClose).not.toHaveBeenCalled()
        expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('my unsaved draft')
    })

    it('Esc in a clean editor cancels editing without closing the modal', () => {
        fireEvent.click(screen.getByText('saved note'))
        const textarea = screen.getByRole('textbox')

        fireEvent.keyDown(textarea, {key: 'Escape'})

        expect(onClose).not.toHaveBeenCalled()
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('Esc in the image lightbox closes the lightbox, not the modal', async () => {
        fireEvent.click(screen.getByText('open image'))
        expect(await screen.findByLabelText(/close/i)).toBeInTheDocument()

        fireEvent.keyDown(document.body, {key: 'Escape'})

        expect(onClose).not.toHaveBeenCalled()
        expect(screen.queryByLabelText(/close/i)).not.toBeInTheDocument()
    })

    it('Esc with no inner layer still closes the modal', () => {
        fireEvent.keyDown(document.body, {key: 'Escape'})

        expect(onClose).toHaveBeenCalledTimes(1)
    })
})

describe('TestDetailModal - an unsaved note draft is never dropped silently', () => {
    beforeEach(() => {
        onClose.mockClear()
        onNoteDirtyChange.mockClear()
        window.scrollTo = vi.fn()
        render(
            <QueryClientProvider client={new QueryClient()}>
                <TestDetailModal
                    test={test}
                    isOpen={true}
                    onClose={onClose}
                    onNoteDirtyChange={onNoteDirtyChange}
                />
            </QueryClientProvider>
        )
        fireEvent.click(screen.getByText('saved note'))
        fireEvent.change(screen.getByRole('textbox'), {target: {value: 'my unsaved draft'}})
    })

    const backdrop = () => document.querySelector('[aria-hidden="true"].fixed') as HTMLElement

    it.each([
        ['a second Esc', () => fireEvent.keyDown(document.body, {key: 'Escape'})],
        ['the X button', () => fireEvent.click(screen.getByText('close-x'))],
        ['a backdrop click', () => fireEvent.click(backdrop())],
    ])('%s asks before closing, and Keep editing returns to the draft', (_n, closeIt) => {
        closeIt()

        expect(onClose).not.toHaveBeenCalled()
        expect(screen.getByText('Discard unsaved note?')).toBeInTheDocument()

        fireEvent.click(screen.getByText('Keep editing'))

        expect(onClose).not.toHaveBeenCalled()
        expect(screen.queryByText('Discard unsaved note?')).not.toBeInTheDocument()
        expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('my unsaved draft')
    })

    it('Discard closes the modal', () => {
        fireEvent.click(screen.getByText('close-x'))
        fireEvent.click(screen.getByText('Discard'))

        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('Esc on the confirm cancels it and keeps the modal and the draft', () => {
        fireEvent.click(screen.getByText('close-x'))
        fireEvent.keyDown(document.body, {key: 'Escape'})

        expect(onClose).not.toHaveBeenCalled()
        expect(screen.queryByText('Discard unsaved note?')).not.toBeInTheDocument()
        expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('my unsaved draft')
    })

    it('switching to the Steps tab and back keeps the draft', () => {
        fireEvent.click(screen.getByText('steps-tab'))
        expect(screen.getByText('steps content')).toBeInTheDocument()
        fireEvent.click(screen.getByText('overview-tab'))

        expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('my unsaved draft')
    })

    it('a saved (clean) note closes at once, as before', () => {
        fireEvent.change(screen.getByRole('textbox'), {target: {value: 'saved note'}})
        fireEvent.click(screen.getByText('close-x'))

        expect(screen.queryByText('Discard unsaved note?')).not.toBeInTheDocument()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('tells the parent when a draft opens and when it is gone', () => {
        expect(onNoteDirtyChange).toHaveBeenLastCalledWith(true)

        fireEvent.click(screen.getByText('Cancel'))

        expect(onNoteDirtyChange).toHaveBeenLastCalledWith(false)
    })

    it('Keep editing from the Steps tab brings the draft back into view', () => {
        fireEvent.click(screen.getByText('steps-tab'))
        fireEvent.click(screen.getByText('close-x'))
        fireEvent.click(screen.getByText('Keep editing'))

        expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('my unsaved draft')
    })

    it('a swipe-down close asks first', () => {
        const handle = screen.getByText('close-x')
        fireEvent.touchStart(handle, {touches: [{clientY: 0}]})
        fireEvent.touchMove(handle, {touches: [{clientY: 120}]})
        fireEvent.touchEnd(handle)

        expect(onClose).not.toHaveBeenCalled()
        expect(screen.getByText('Discard unsaved note?')).toBeInTheDocument()
    })

    it('warns before the page unloads while the draft is unsaved, not after it is gone', () => {
        const unload = () => {
            const e = new Event('beforeunload', {cancelable: true})
            window.dispatchEvent(e)
            return e.defaultPrevented
        }
        expect(unload()).toBe(true)

        fireEvent.click(screen.getByText('Cancel'))

        expect(unload()).toBe(false)
    })
})

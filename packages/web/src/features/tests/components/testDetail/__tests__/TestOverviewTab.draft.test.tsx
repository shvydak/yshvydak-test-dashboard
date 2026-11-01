import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {TestResult} from '@yshvydak/core'
import {TestOverviewTab} from '../TestOverviewTab'

vi.mock('../../../hooks/useNoteImages', () => ({
    useNoteImages: () => ({images: [], loading: false, error: null, refetch: vi.fn()}),
}))

const makeTest = (testId: string, note: string): TestResult =>
    ({
        id: `exec-${testId}`,
        testId,
        name: 'A test',
        filePath: 'a.spec.ts',
        status: 'passed',
        duration: 1,
        runId: 'run-1',
        note: {content: note},
        timestamp: '2026-09-01T10:00:00Z',
    }) as TestResult

describe('TestOverviewTab - note draft wiring', () => {
    const onNoteDirtyChange = vi.fn()

    const renderTab = (test: TestResult) => (
        <QueryClientProvider client={new QueryClient()}>
            <TestOverviewTab
                test={test}
                attachments={[]}
                attachmentsLoading={false}
                attachmentsError={null}
                onAttachmentsError={vi.fn()}
                onSaveNote={vi.fn()}
                onDeleteNote={vi.fn()}
                onNoteDirtyChange={onNoteDirtyChange}
            />
        </QueryClientProvider>
    )

    beforeEach(() => onNoteDirtyChange.mockClear())

    it('passes the draft flag of the real note editor on', () => {
        render(renderTab(makeTest('t1', 'saved note')))
        fireEvent.click(screen.getByText('saved note'))

        fireEvent.change(screen.getByRole('textbox'), {target: {value: 'a draft'}})

        expect(onNoteDirtyChange).toHaveBeenLastCalledWith(true)
    })

    it('resets the editor when the tab shows another test', () => {
        const {rerender} = render(renderTab(makeTest('t1', 'note one')))
        fireEvent.click(screen.getByText('note one'))
        fireEvent.change(screen.getByRole('textbox'), {target: {value: 'a draft'}})

        rerender(renderTab(makeTest('t2', 'note two')))

        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
        expect(screen.getByText('note two')).toBeInTheDocument()
    })
})

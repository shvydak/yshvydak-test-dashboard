import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {render, screen, waitFor, act} from '@testing-library/react'
import type {NoteImage, TestResult} from '@yshvydak/core'
import {NoteImageThumbnail} from '../testDetail/NoteImageThumbnail'
import {NoteImageLightbox} from '../testDetail/NoteImageLightbox'
import {TestRow} from '../TestRow'

const mockCreateUrl = vi.hoisted(() => vi.fn())
vi.mock('@features/authentication/utils/authFetch', () => ({
    createProtectedFileURL: mockCreateUrl,
}))

const mockImages = vi.hoisted(() => ({current: [] as unknown[]}))
vi.mock('../../hooks/useNoteImages', () => ({
    useNoteImages: () => ({images: mockImages.current}),
}))

vi.mock('../../store/testsStore', () => ({
    useTestsStore: vi.fn((selector: (s: unknown) => unknown) =>
        selector({
            runningTests: new Set<string>(),
            getIsAnyTestRunning: () => false,
            activeProgress: null,
        })
    ),
}))

const image = (id: string): NoteImage =>
    ({id, fileName: `${id}.png`, url: `/note-images/t/${id}.png`}) as NoteImage

let revoke: ReturnType<typeof vi.spyOn>
let counter: number

beforeEach(() => {
    counter = 0
    mockCreateUrl.mockReset()
    mockCreateUrl.mockImplementation(async () => `blob:test/${++counter}`)
    revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

afterEach(() => {
    revoke.mockRestore()
})

describe('note image blob URLs are revoked', () => {
    it('the detail thumbnail revokes its blob URL on unmount', async () => {
        const view = render(<NoteImageThumbnail image={image('a')} />)
        await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:test/1'))

        view.unmount()

        expect(revoke).toHaveBeenCalledWith('blob:test/1')
    })

    it('the detail thumbnail revokes the old URL when it switches to another image', async () => {
        const view = render(<NoteImageThumbnail image={image('a')} />)
        await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:test/1'))

        view.rerender(<NoteImageThumbnail image={image('b')} />)
        await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:test/2'))

        expect(revoke).toHaveBeenCalledWith('blob:test/1')
        expect(revoke).not.toHaveBeenCalledWith('blob:test/2')
    })

    it('an answer that arrives after unmount is revoked at once', async () => {
        let resolve!: (url: string) => void
        mockCreateUrl.mockImplementationOnce(() => new Promise<string>((r) => (resolve = r)))
        const view = render(<NoteImageThumbnail image={image('a')} />)

        view.unmount()
        await act(async () => resolve('blob:late'))

        expect(revoke).toHaveBeenCalledWith('blob:late')
    })

    it('the lightbox revokes its blob URL when it closes', async () => {
        const view = render(<NoteImageLightbox image={image('a')} isOpen onClose={vi.fn()} />)
        await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:test/1'))

        view.rerender(<NoteImageLightbox image={image('a')} isOpen={false} onClose={vi.fn()} />)

        expect(revoke).toHaveBeenCalledWith('blob:test/1')
    })

    it('the lightbox revokes its blob URL on unmount', async () => {
        const view = render(<NoteImageLightbox image={image('a')} isOpen onClose={vi.fn()} />)
        await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:test/1'))

        view.unmount()

        expect(revoke).toHaveBeenCalledWith('blob:test/1')
    })

    it('the row thumbnail revokes its blob URL when the row goes away', async () => {
        mockImages.current = [image('a')]
        const test = {
            id: 'e1',
            testId: 't1',
            name: 'T',
            filePath: 'a.spec.ts',
            status: 'passed',
            duration: 1,
            runId: 'r',
            note: {content: 'see [IMAGE:a]'},
        } as unknown as TestResult
        const view = render(
            <table>
                <tbody>
                    <TestRow test={test} selected={false} onSelect={vi.fn()} onRerun={vi.fn()} />
                </tbody>
            </table>
        )
        await waitFor(() => expect(document.querySelector('img')).not.toBeNull())
        expect(document.querySelector('img')).toHaveAttribute('src', 'blob:test/1')

        view.unmount()

        expect(revoke).toHaveBeenCalledWith('blob:test/1')
        mockImages.current = []
    })
})

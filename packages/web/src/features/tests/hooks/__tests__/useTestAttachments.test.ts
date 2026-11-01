import {describe, it, expect, vi, beforeEach} from 'vitest'
import {renderHook, act, waitFor} from '@testing-library/react'
import {useTestAttachments} from '../useTestAttachments'

vi.mock('@features/authentication/utils/authFetch', () => ({
    authFetch: vi.fn(),
    createProtectedFileBlob: vi.fn(),
}))
vi.mock('@config/environment.config', () => ({config: {api: {serverUrl: 'http://s'}}}))

import {authFetch, createProtectedFileBlob} from '@features/authentication/utils/authFetch'

const mockFetch = authFetch as ReturnType<typeof vi.fn>
const mockBlob = createProtectedFileBlob as ReturnType<typeof vi.fn>

const list = (id: string) =>
    ({
        ok: true,
        json: () =>
            Promise.resolve({
                data: [{id, type: 'screenshot', url: `/files/${id}.png`, testResultId: 'x'}],
            }),
    }) as unknown as Response

const defer = <T>() => {
    let resolve!: (v: T) => void
    const promise = new Promise<T>((r) => (resolve = r))
    return {promise, resolve}
}

describe('useTestAttachments — races', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        URL.revokeObjectURL = vi.fn() // jsdom has none
        mockBlob.mockImplementation(async (path: string) => ({
            url: `blob:${path}`,
            type: 'image/png',
        }))
    })

    it('a slower answer for the first execution never replaces the second one', async () => {
        const slowA = defer<Response>()
        mockFetch.mockReturnValueOnce(slowA.promise)
        const {result, rerender} = renderHook(({id}) => useTestAttachments(id, true), {
            initialProps: {id: 'A'},
        })

        mockFetch.mockResolvedValueOnce(list('from-B'))
        rerender({id: 'B'})
        await waitFor(() => expect(result.current.attachments[0]?.id).toBe('from-B'))

        await act(async () => slowA.resolve(list('from-A')))

        expect(result.current.attachments.map((a) => a.id)).toEqual(['from-B'])
        expect(result.current.loading).toBe(false)
    })

    it('files of the previous execution disappear while the next one loads', async () => {
        mockFetch.mockResolvedValueOnce(list('from-A'))
        const {result, rerender} = renderHook(({id}) => useTestAttachments(id, true), {
            initialProps: {id: 'A'},
        })
        await waitFor(() => expect(result.current.attachments).toHaveLength(1))

        mockFetch.mockReturnValueOnce(new Promise(() => {}))
        rerender({id: 'B'})

        expect(result.current.attachments).toEqual([])
    })

    it('a blob that finishes after its request was dropped is revoked, not leaked', async () => {
        mockFetch.mockResolvedValueOnce(list('from-A'))
        let finishBlob!: () => void
        mockBlob.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishBlob = () => resolve({url: 'blob:/files/from-A.png', type: 'image/png'})
                })
        )
        const {result, rerender} = renderHook(({id}) => useTestAttachments(id, true), {
            initialProps: {id: 'A'},
        })
        await waitFor(() => expect(finishBlob).toBeTypeOf('function'))

        mockFetch.mockResolvedValueOnce(list('from-B'))
        rerender({id: 'B'})
        await waitFor(() => expect(result.current.attachments[0]?.id).toBe('from-B'))
        await act(async () => finishBlob())

        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:/files/from-A.png')
        // A's list (its blobs now revoked) must not replace B's
        expect(result.current.attachments.map((a) => a.id)).toEqual(['from-B'])
    })

    it('a dropped request does not end the loading state of the one that replaced it', async () => {
        const slowA = defer<Response>()
        mockFetch.mockReturnValueOnce(slowA.promise)
        const {result, rerender} = renderHook(({id}) => useTestAttachments(id, true), {
            initialProps: {id: 'A'},
        })
        mockFetch.mockReturnValueOnce(new Promise(() => {})) // B never answers
        rerender({id: 'B'})

        await act(async () => slowA.resolve(list('from-A')))

        expect(result.current.loading).toBe(true)
    })

    it('blobs of the shown list are revoked when the execution changes', async () => {
        mockFetch.mockResolvedValueOnce(list('from-A'))
        const {result, rerender} = renderHook(({id}) => useTestAttachments(id, true), {
            initialProps: {id: 'A'},
        })
        await waitFor(() => expect(result.current.attachments).toHaveLength(1))

        mockFetch.mockReturnValueOnce(new Promise(() => {}))
        rerender({id: 'B'})

        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:/files/from-A.png')
    })

    it('keeps the blob MIME type on the attachment', async () => {
        mockFetch.mockResolvedValueOnce(list('A'))
        mockBlob.mockResolvedValueOnce({url: 'blob:x', type: 'image/svg+xml'})
        const {result} = renderHook(() => useTestAttachments('A', true))
        await waitFor(() => expect(result.current.attachments[0]?.blobType).toBe('image/svg+xml'))
    })
})

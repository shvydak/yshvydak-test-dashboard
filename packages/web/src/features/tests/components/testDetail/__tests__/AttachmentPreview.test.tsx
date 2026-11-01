import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import {AttachmentPreview} from '../AttachmentPreview'
import {AttachmentWithBlobURL} from '../../../types/attachment.types'

vi.mock('@config/environment.config', () => ({config: {api: {serverUrl: 'http://s'}}}))
vi.mock('../../../utils/attachmentHelpers', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../utils/attachmentHelpers')>()),
    downloadAttachment: vi.fn(),
    openAttachmentInNewWindow: vi.fn(),
}))

import {downloadAttachment} from '../../../utils/attachmentHelpers'

const shot = (blobType?: string): AttachmentWithBlobURL => ({
    id: 'a1',
    testResultId: 'r1',
    type: 'screenshot',
    filePath: '/x/shot.png',
    fileSize: 1,
    url: '/files/shot.png',
    blobURL: 'blob:http://app/1',
    blobType,
})

describe('AttachmentPreview — opening a screenshot in a new tab', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.spyOn(window, 'open').mockImplementation(() => null)
    })

    it.each(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])(
        'opens a %s blob in a tab',
        (type) => {
            render(<AttachmentPreview attachment={shot(type)} />)
            fireEvent.click(screen.getByAltText('Test Screenshot'))
            expect(window.open).toHaveBeenCalledWith('blob:http://app/1', '_blank')
            expect(downloadAttachment).not.toHaveBeenCalled()
        }
    )

    it.each(['image/svg+xml', 'text/html', 'application/octet-stream', '', undefined])(
        'downloads instead of opening a %s blob (it would run on the app origin)',
        (type) => {
            render(<AttachmentPreview attachment={shot(type)} />)
            fireEvent.click(screen.getByAltText('Test Screenshot'))
            expect(window.open).not.toHaveBeenCalled()
            expect(downloadAttachment).toHaveBeenCalledTimes(1)
        }
    )
})

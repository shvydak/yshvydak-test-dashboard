import {config} from '@config/environment.config'
import {createProtectedFileURL, getAuthToken} from '@features/authentication/utils/authFetch'
import {AttachmentWithBlobURL} from '../types/attachment.types'

export function getAttachmentIcon(type: string): string {
    switch (type) {
        case 'video':
            return '🎬'
        case 'screenshot':
            return '📸'
        case 'trace':
            return '🔍'
        case 'log':
            return '📄'
        default:
            return '📎'
    }
}

export function formatFileSize(bytes: number): string {
    if (bytes === 0) return 'N/A'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export async function downloadAttachment(
    attachment: AttachmentWithBlobURL,
    onError: (error: string) => void
): Promise<void> {
    try {
        const blobURL = await createProtectedFileURL(attachment.url, config.api.serverUrl)
        const link = document.createElement('a')
        link.href = blobURL
        link.download = attachment.url.split('/').pop() || 'attachment'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(blobURL)
    } catch (error) {
        console.error('Failed to download attachment:', error)
        onError('Failed to download attachment')
    }
}

export async function openTraceViewer(
    attachment: AttachmentWithBlobURL,
    onError: (error: string) => void
): Promise<void> {
    try {
        const token = getAuthToken()
        if (!token) {
            onError('Authentication required to view trace')
            return
        }

        const traceURL = `${config.api.serverUrl}/api/tests/traces/${attachment.id}?token=${encodeURIComponent(token)}`
        window.open(`https://trace.playwright.dev/?trace=${encodeURIComponent(traceURL)}`, '_blank')
    } catch (error) {
        console.error('Failed to open trace viewer:', error)
        onError('Failed to open trace viewer')
    }
}

import {config} from '@config/environment.config'
import {createProtectedFileURL, getAuthToken} from '@features/authentication/utils/authFetch'
import {AttachmentWithBlobURL} from '../types/attachment.types'

/**
 * Build a full URL for an attachment by safely joining base URL and attachment path
 * Handles leading/trailing slashes to prevent double slashes
 */
export function buildAttachmentUrl(baseUrl: string, attachmentUrl: string): string {
    const cleanPath = attachmentUrl.startsWith('/') ? attachmentUrl : `/${attachmentUrl}`
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
    return `${cleanBaseUrl}${cleanPath}`
}

/**
 * Build an authenticated URL for attachment with token in query parameter
 * Used as fallback when blob URL is not available for inline preview
 * Note: Token will be visible in DOM, use blob URLs when possible
 */
export function buildAuthenticatedAttachmentUrl(
    baseUrl: string,
    attachmentUrl: string
): string | null {
    const token = getAuthToken()
    if (!token) {
        return null
    }
    const attachmentPath = `${attachmentUrl}?token=${encodeURIComponent(token)}`
    return buildAttachmentUrl(baseUrl, attachmentPath)
}

// A blob URL opened in a tab runs on the app origin (no nosniff/CSP): only raster images, never SVG.
const SAFE_TAB_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

export function canOpenBlobInTab(blobType: string | undefined): boolean {
    return !!blobType && SAFE_TAB_IMAGE_TYPES.has(blobType)
}

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

        const tracePath = `/api/tests/traces/${attachment.id}?token=${encodeURIComponent(token)}`
        const traceURL = buildAttachmentUrl(config.api.serverUrl, tracePath)
        window.open(`https://trace.playwright.dev/?trace=${encodeURIComponent(traceURL)}`, '_blank')
    } catch (error) {
        console.error('Failed to open trace viewer:', error)
        onError('Failed to open trace viewer')
    }
}

export async function openAttachmentInNewWindow(
    attachment: AttachmentWithBlobURL,
    onError: (error: string) => void
): Promise<void> {
    try {
        const token = getAuthToken()
        if (!token) {
            onError('Authentication required to view attachment')
            return
        }

        // Add token query parameter to attachment URL
        const attachmentPath = `${attachment.url}?token=${encodeURIComponent(token)}`
        const attachmentURL = buildAttachmentUrl(config.api.serverUrl, attachmentPath)
        window.open(attachmentURL, '_blank')
    } catch (error) {
        console.error('Failed to open attachment:', error)
        onError('Failed to open attachment')
    }
}

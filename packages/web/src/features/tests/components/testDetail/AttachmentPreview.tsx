import {config} from '@config/environment.config'
import {
    buildAuthenticatedAttachmentUrl,
    openAttachmentInNewWindow,
} from '../../utils/attachmentHelpers'
import {AttachmentWithBlobURL} from '../../types/attachment.types'

export interface AttachmentPreviewProps {
    attachment: AttachmentWithBlobURL
}

export function AttachmentPreview({attachment}: AttachmentPreviewProps) {
    if (attachment.type === 'screenshot') {
        return (
            <div className="mt-4">
                <img
                    src={
                        attachment.blobURL ||
                        buildAuthenticatedAttachmentUrl(config.api.serverUrl, attachment.url) ||
                        ''
                    }
                    alt="Test Screenshot"
                    className="max-w-full h-auto rounded border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => {
                        // Use blob URL for inline preview if available, otherwise open with token
                        if (attachment.blobURL) {
                            window.open(attachment.blobURL, '_blank')
                        } else {
                            openAttachmentInNewWindow(attachment, (error) => {
                                console.error('Failed to open screenshot:', error)
                            })
                        }
                    }}
                />
            </div>
        )
    }

    if (attachment.type === 'video') {
        return (
            <div className="mt-4">
                <video
                    controls
                    className="max-w-full h-auto rounded border border-gray-200 dark:border-gray-700"
                    src={
                        attachment.blobURL ||
                        buildAuthenticatedAttachmentUrl(config.api.serverUrl, attachment.url) ||
                        ''
                    }>
                    Your browser does not support video playback.
                </video>
            </div>
        )
    }

    return null
}

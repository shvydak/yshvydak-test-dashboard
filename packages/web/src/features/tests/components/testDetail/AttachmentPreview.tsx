import {config} from '@config/environment.config'
import {
    buildAuthenticatedAttachmentUrl,
    canOpenBlobInTab,
    downloadAttachment,
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
                    className="max-w-full h-auto rounded-xl border border-gray-200/80 dark:border-white/[0.08] cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => {
                        // A blob is opened only when it is a real raster image; else it downloads
                        if (attachment.blobURL) {
                            if (canOpenBlobInTab(attachment.blobType)) {
                                window.open(attachment.blobURL, '_blank')
                            } else {
                                downloadAttachment(attachment, (error) => {
                                    console.error('Failed to download screenshot:', error)
                                })
                            }
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
                    className="max-w-full h-auto rounded-xl border border-gray-200/80 dark:border-white/[0.08]"
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

import {config} from '@config/environment.config'
import {createProtectedFileURL} from '@features/authentication/utils/authFetch'
import {AttachmentWithBlobURL} from '../../types/attachment.types'

export interface AttachmentPreviewProps {
    attachment: AttachmentWithBlobURL
}

export function AttachmentPreview({attachment}: AttachmentPreviewProps) {
    if (attachment.type === 'screenshot') {
        return (
            <div className="mt-4">
                <img
                    src={attachment.blobURL || `${config.api.serverUrl}/${attachment.url}`}
                    alt="Test Screenshot"
                    className="max-w-full h-auto rounded border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={async () => {
                        try {
                            const blobURL =
                                attachment.blobURL ||
                                (await createProtectedFileURL(attachment.url, config.api.serverUrl))
                            window.open(blobURL, '_blank')
                        } catch (error) {
                            console.error('Failed to open screenshot:', error)
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
                    src={attachment.blobURL || `${config.api.serverUrl}/${attachment.url}`}>
                    Your browser does not support video playback.
                </video>
            </div>
        )
    }

    return null
}

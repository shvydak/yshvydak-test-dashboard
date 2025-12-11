import {AttachmentWithBlobURL} from '../../types/attachment.types'
import {
    getAttachmentIcon,
    formatFileSize,
    downloadAttachment,
    openTraceViewer,
    openAttachmentInNewWindow,
} from '../../utils/attachmentHelpers'
import {AttachmentPreview} from './AttachmentPreview'

export interface AttachmentItemProps {
    attachment: AttachmentWithBlobURL
    onError: (error: string) => void
}

export function AttachmentItem({attachment, onError}: AttachmentItemProps) {
    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <span className="text-2xl">{getAttachmentIcon(attachment.type)}</span>
                    <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">
                            {attachment.type.charAt(0).toUpperCase() + attachment.type.slice(1)}
                        </h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {formatFileSize(attachment.fileSize)}
                        </p>
                    </div>
                </div>
                <div className="flex space-x-2">
                    {attachment.type === 'trace' && (
                        <button
                            onClick={() => openTraceViewer(attachment, onError)}
                            className="px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-md text-sm hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors">
                            🔍 View Trace
                        </button>
                    )}
                    {attachment.type === 'log' && (
                        <button
                            onClick={() => openAttachmentInNewWindow(attachment, onError)}
                            className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-md text-sm hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors">
                            👁️ View
                        </button>
                    )}
                    <button
                        onClick={() => downloadAttachment(attachment, onError)}
                        className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                        📥 Download
                    </button>
                </div>
            </div>
            <AttachmentPreview attachment={attachment} />
        </div>
    )
}

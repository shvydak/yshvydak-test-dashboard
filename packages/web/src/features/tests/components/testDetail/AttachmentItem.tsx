import {Video, Camera, ScanSearch, FileText, Paperclip, Eye, Download} from 'lucide-react'
import {AttachmentWithBlobURL} from '../../types/attachment.types'
import {
    formatFileSize,
    downloadAttachment,
    openTraceViewer,
    openAttachmentInNewWindow,
} from '../../utils/attachmentHelpers'
import {AttachmentPreview} from './AttachmentPreview'

function AttachmentTypeIcon({type}: {type: string}) {
    const cls = 'h-5 w-5 text-gray-500 dark:text-gray-400'
    switch (type) {
        case 'video':
            return <Video className={cls} />
        case 'screenshot':
            return <Camera className={cls} />
        case 'trace':
            return <ScanSearch className={cls} />
        case 'log':
            return <FileText className={cls} />
        default:
            return <Paperclip className={cls} />
    }
}

export interface AttachmentItemProps {
    attachment: AttachmentWithBlobURL
    onError: (error: string) => void
}

export function AttachmentItem({attachment, onError}: AttachmentItemProps) {
    return (
        <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-card transition-all duration-200 dark:border-white/[0.07] dark:bg-gray-800/70 dark:backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-white/[0.05]">
                        <AttachmentTypeIcon type={attachment.type} />
                    </div>
                    <div className="min-w-0">
                        <h4 className="font-semibold tracking-tight text-gray-900 dark:text-white">
                            {attachment.type.charAt(0).toUpperCase() + attachment.type.slice(1)}
                        </h4>
                        <p className="text-xs font-mono tabular-nums text-gray-400 dark:text-gray-500">
                            {formatFileSize(attachment.fileSize)}
                        </p>
                    </div>
                </div>
                <div className="flex flex-shrink-0 gap-2">
                    {attachment.type === 'trace' && (
                        <button
                            onClick={() => openTraceViewer(attachment, onError)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 ring-1 ring-inset ring-primary-600/15 transition-all hover:bg-primary-100 active:scale-[0.98] dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-400/20 dark:hover:bg-primary-500/20">
                            <ScanSearch className="h-3.5 w-3.5" /> View Trace
                        </button>
                    )}
                    {attachment.type === 'log' && (
                        <button
                            onClick={() => openAttachmentInNewWindow(attachment, onError)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 ring-1 ring-inset ring-primary-600/15 transition-all hover:bg-primary-100 active:scale-[0.98] dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-400/20 dark:hover:bg-primary-500/20">
                            <Eye className="h-3.5 w-3.5" /> View
                        </button>
                    )}
                    <button
                        onClick={() => downloadAttachment(attachment, onError)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-all hover:bg-gray-50 hover:border-gray-300 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-300 dark:hover:bg-white/[0.09]">
                        <Download className="h-3.5 w-3.5" /> Download
                    </button>
                </div>
            </div>
            <AttachmentPreview attachment={attachment} />
        </div>
    )
}

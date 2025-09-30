import {LoadingSpinner} from '@shared/components'
import {AttachmentWithBlobURL} from '../../types/attachment.types'
import {AttachmentItem} from './AttachmentItem'

export interface TestAttachmentsTabProps {
    attachments: AttachmentWithBlobURL[]
    loading: boolean
    error: string | null
    onError: (error: string) => void
}

export function TestAttachmentsTab({
    attachments,
    loading,
    error,
    onError,
}: TestAttachmentsTabProps) {
    if (loading) {
        return (
            <div className="text-center py-8">
                <LoadingSpinner size="md" />
                <p className="mt-2 text-sm text-gray-500">Loading attachments...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="text-center py-8">
                <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
        )
    }

    if (attachments.length === 0) {
        return (
            <div className="text-center py-8">
                <p className="text-gray-500 dark:text-gray-400">
                    No attachments found for this test
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
                {attachments.map((attachment) => (
                    <AttachmentItem key={attachment.id} attachment={attachment} onError={onError} />
                ))}
            </div>
        </div>
    )
}

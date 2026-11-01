import {useState, useEffect} from 'react'
import {config} from '@config/environment.config'
import {authFetch, createProtectedFileBlob} from '@features/authentication/utils/authFetch'
import {AttachmentWithBlobURL, Attachment} from '../types/attachment.types'

export interface UseTestAttachmentsReturn {
    attachments: AttachmentWithBlobURL[]
    loading: boolean
    error: string | null
    setError: (error: string | null) => void
}

export function useTestAttachments(
    testId: string | null,
    isOpen: boolean
): UseTestAttachmentsReturn {
    const [attachments, setAttachments] = useState<AttachmentWithBlobURL[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        // Another execution's files must never show under this one, nor a slower old answer replace it
        setAttachments([])
        if (!(isOpen && testId)) {
            setLoading(false)
            return
        }

        let cancelled = false
        const created: string[] = []

        const fetchAttachments = async () => {
            setLoading(true)
            setError(null)
            try {
                const response = await authFetch(
                    `${config.api.serverUrl}/api/tests/${testId}/attachments`
                )
                if (cancelled) return
                if (response.ok) {
                    const data = await response.json()
                    const attachmentsData: Attachment[] = data.data || []

                    const attachmentsWithBlobs = await Promise.all(
                        attachmentsData.map(async (attachment) => {
                            let blobURL: string | undefined
                            let blobType: string | undefined

                            if (attachment.type === 'screenshot' || attachment.type === 'video') {
                                try {
                                    const file = await createProtectedFileBlob(
                                        attachment.url,
                                        config.api.serverUrl
                                    )
                                    blobURL = file.url
                                    blobType = file.type
                                    // Finished after this request was dropped: nobody will show it
                                    if (cancelled) URL.revokeObjectURL(file.url)
                                    else created.push(file.url)
                                } catch (error) {
                                    console.error(
                                        `Failed to create blob URL for ${attachment.type}:`,
                                        error
                                    )
                                }
                            }

                            return {...attachment, blobURL, blobType}
                        })
                    )

                    if (cancelled) return
                    setAttachments(attachmentsWithBlobs)
                } else {
                    setError('Failed to fetch attachments')
                }
            } catch {
                if (!cancelled) setError('Error fetching attachments')
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        fetchAttachments()
        return () => {
            cancelled = true
            // Every blob this request made, shown or discarded
            created.forEach((url) => URL.revokeObjectURL(url))
        }
    }, [isOpen, testId])

    return {attachments, loading, error, setError}
}

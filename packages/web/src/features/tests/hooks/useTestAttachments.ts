import { useState, useEffect } from 'react'
import { config } from '@config/environment.config'
import { authFetch, createProtectedFileURL } from '@features/authentication/utils/authFetch'
import { AttachmentWithBlobURL, Attachment } from '../types/attachment.types'

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
		if (isOpen && testId) {
			fetchAttachments(testId)
		}

		return () => {
			attachments.forEach((attachment) => {
				if (attachment.blobURL) {
					URL.revokeObjectURL(attachment.blobURL)
				}
			})
		}
	}, [isOpen, testId])

	useEffect(() => {
		return () => {
			attachments.forEach((attachment) => {
				if (attachment.blobURL) {
					URL.revokeObjectURL(attachment.blobURL)
				}
			})
		}
	}, [attachments])

	const fetchAttachments = async (testId: string) => {
		setLoading(true)
		setError(null)
		try {
			const response = await authFetch(
				`${config.api.serverUrl}/api/tests/${testId}/attachments`
			)
			if (response.ok) {
				const data = await response.json()
				const attachmentsData: Attachment[] = data.data || []

				const attachmentsWithBlobs = await Promise.all(
					attachmentsData.map(async (attachment) => {
						let blobURL: string | undefined

						if (
							attachment.type === 'screenshot' ||
							attachment.type === 'video'
						) {
							try {
								blobURL = await createProtectedFileURL(
									attachment.url,
									config.api.serverUrl
								)
							} catch (error) {
								console.error(
									`Failed to create blob URL for ${attachment.type}:`,
									error
								)
							}
						}

						return { ...attachment, blobURL }
					})
				)

				setAttachments(attachmentsWithBlobs)
			} else {
				setError('Failed to fetch attachments')
			}
		} catch (err) {
			setError('Error fetching attachments')
		} finally {
			setLoading(false)
		}
	}

	return { attachments, loading, error, setError }
}

export interface Attachment {
	id: string
	testResultId: string
	type: 'video' | 'screenshot' | 'trace' | 'log'
	filePath: string
	fileSize: number
	url: string
}

export interface AttachmentWithBlobURL extends Attachment {
	blobURL?: string
}

export type TabKey = 'overview' | 'attachments' | 'steps'

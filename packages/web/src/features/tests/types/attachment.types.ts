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
    /** MIME type the server declared for the blob; decides whether it may open in a tab. */
    blobType?: string
}

export type TabKey = 'overview' | 'steps'

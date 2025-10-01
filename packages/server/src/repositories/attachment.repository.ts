import {BaseRepository} from './base.repository'
import {AttachmentData} from '../types/database.types'
import {FileUtil} from '../utils/file.util'

export class AttachmentRepository extends BaseRepository {
    async saveAttachment(attachmentData: AttachmentData): Promise<string> {
        await this.dbManager.saveAttachment(attachmentData)
        return attachmentData.id
    }

    async getAttachmentsByTestResult(testResultId: string): Promise<AttachmentData[]> {
        const rows = await this.queryAll<any>(
            'SELECT * FROM attachments WHERE test_result_id = ?',
            [testResultId]
        )

        return rows.map((row) => ({
            id: row.id,
            testResultId: row.test_result_id,
            type: row.type,
            fileName: row.file_name,
            filePath: row.file_path,
            fileSize: row.file_size,
            mimeType: row.mime_type,
            url: row.url,
        }))
    }

    async getAttachmentsWithUrls(testResultId: string): Promise<AttachmentData[]> {
        const attachments = await this.getAttachmentsByTestResult(testResultId)

        return attachments.map((attachment) => {
            if (!attachment.url) {
                return {
                    ...attachment,
                    url: attachment.filePath
                        ? FileUtil.convertToRelativeUrl(attachment.filePath)
                        : '',
                }
            }

            if (attachment.url.startsWith('/attachments/')) {
                return attachment
            }

            return {
                ...attachment,
                url: attachment.filePath
                    ? FileUtil.convertToRelativeUrl(attachment.filePath)
                    : attachment.url,
            }
        })
    }

    async deleteAttachmentsByTestResult(testResultId: string): Promise<void> {
        await this.execute('DELETE FROM attachments WHERE test_result_id = ?', [testResultId])
    }

    async getAttachmentById(attachmentId: string): Promise<AttachmentData | null> {
        const rows = await this.queryAll<any>('SELECT * FROM attachments WHERE id = ?', [
            attachmentId,
        ])

        if (rows.length === 0) {
            return null
        }

        const row = rows[0]
        return {
            id: row.id,
            testResultId: row.test_result_id,
            type: row.type,
            fileName: row.file_name,
            filePath: row.file_path,
            fileSize: row.file_size,
            mimeType: row.mime_type,
            url: row.url,
        }
    }
}

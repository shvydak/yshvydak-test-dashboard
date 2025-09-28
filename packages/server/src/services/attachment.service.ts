import { v4 as uuidv4 } from 'uuid'
import { IAttachmentService } from '../types/service.types'
import { AttachmentData } from '../types/database.types'
import { AttachmentRepository } from '../repositories/attachment.repository'
import { FileUtil } from '../utils/file.util'

export class AttachmentService implements IAttachmentService {
    constructor(private attachmentRepository: AttachmentRepository) {}

    mapContentTypeToDbType(contentType: string, fileName: string): string {
        return FileUtil.mapContentTypeToDbType(contentType, fileName)
    }

    async processAttachments(attachments: any[]): Promise<AttachmentData[]> {
        const processedAttachments: AttachmentData[] = []

        for (const attachment of attachments) {
            if (attachment.name && attachment.path) {
                const attachmentType = this.mapContentTypeToDbType(
                    attachment.contentType || '',
                    attachment.name || ''
                )

                const attachmentData: AttachmentData = {
                    id: uuidv4(),
                    testResultId: '', // Will be set by caller
                    type: attachmentType as any,
                    fileName: attachment.name,
                    filePath: attachment.path,
                    fileSize: FileUtil.getFileSize(attachment.path),
                    url: attachment.path
                }

                processedAttachments.push(attachmentData)
            }
        }

        return processedAttachments
    }

    async getAttachmentsByTestResult(testResultId: string): Promise<AttachmentData[]> {
        return this.attachmentRepository.getAttachmentsWithUrls(testResultId)
    }

    async saveAttachmentsForTestResult(testResultId: string, attachments: any[]): Promise<void> {
        // First, delete existing attachments for this test result
        await this.attachmentRepository.deleteAttachmentsByTestResult(testResultId)

        // Process and save new attachments
        const processedAttachments = await this.processAttachments(attachments)

        for (const attachment of processedAttachments) {
            attachment.testResultId = testResultId
            await this.attachmentRepository.saveAttachment(attachment)
        }
    }

    async getAttachmentById(attachmentId: string): Promise<AttachmentData | null> {
        return this.attachmentRepository.getAttachmentById(attachmentId)
    }
}
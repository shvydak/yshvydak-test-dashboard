import {IAttachmentService} from '../types/service.types'
import {AttachmentData} from '../types/database.types'
import {AttachmentRepository} from '../repositories/attachment.repository'
import {FileUtil} from '../utils/file.util'
import {AttachmentManager, AttachmentType} from '../storage/attachmentManager'
import {config} from '../config/environment.config'
import {Logger} from '../utils/logger.util'
import fs from 'fs'

/**
 * Service for managing test attachments (videos, screenshots, traces)
 * Handles copying files from Playwright's temporary directory to permanent storage
 */
export class AttachmentService implements IAttachmentService {
    private attachmentManager: AttachmentManager

    constructor(private attachmentRepository: AttachmentRepository) {
        this.attachmentManager = new AttachmentManager(config.storage.outputDir)
    }

    mapContentTypeToDbType(contentType: string, fileName: string): string {
        return FileUtil.mapContentTypeToDbType(contentType, fileName)
    }

    /**
     * Processes raw attachments from Playwright reporter and copies files to permanent storage
     * @param attachments - Array of attachment objects from reporter containing file paths
     * @param testResultId - ID of the test result to link attachments to
     * @returns Array of processed attachment data with permanent file paths and URLs
     */
    async processAttachments(attachments: any[], testResultId: string): Promise<AttachmentData[]> {
        const processedAttachments: AttachmentData[] = []

        for (const attachment of attachments) {
            if (attachment.name && attachment.path) {
                const sourceFilePath = attachment.path

                if (!fs.existsSync(sourceFilePath)) {
                    Logger.warn(`[AttachmentService] Source file not found: ${sourceFilePath}`)
                    continue
                }

                const attachmentType = this.mapContentTypeToDbType(
                    attachment.contentType || '',
                    attachment.name || ''
                ) as AttachmentType

                try {
                    const copiedAttachment = await this.attachmentManager.copyPlaywrightAttachment(
                        sourceFilePath,
                        testResultId,
                        attachmentType
                    )

                    const attachmentData: AttachmentData = {
                        id: copiedAttachment.id,
                        testResultId: testResultId,
                        type: copiedAttachment.type as any,
                        fileName: copiedAttachment.fileName,
                        filePath: copiedAttachment.filePath,
                        fileSize: copiedAttachment.fileSize,
                        mimeType: copiedAttachment.mimeType,
                        url: copiedAttachment.url,
                    }

                    processedAttachments.push(attachmentData)
                } catch (error) {
                    Logger.error(
                        `[AttachmentService] Failed to copy attachment ${sourceFilePath}:`,
                        error
                    )
                }
            }
        }

        return processedAttachments
    }

    /**
     * Retrieves all attachments for a test result with properly formatted URLs
     * @param testResultId - ID of the test result
     * @returns Array of attachments with URLs ready for frontend consumption
     */
    async getAttachmentsByTestResult(testResultId: string): Promise<AttachmentData[]> {
        return this.attachmentRepository.getAttachmentsWithUrls(testResultId)
    }

    /**
     * Saves attachments for a test result
     * Each test execution maintains independent attachments in permanent storage
     * @param testResultId - ID of the test result (unique per execution)
     * @param attachments - Raw attachment data from Playwright reporter
     */
    async saveAttachmentsForTestResult(testResultId: string, attachments: any[]): Promise<void> {
        const processedAttachments = await this.processAttachments(attachments, testResultId)

        for (const attachment of processedAttachments) {
            await this.attachmentRepository.saveAttachment(attachment)
        }
    }

    async getAttachmentById(attachmentId: string): Promise<AttachmentData | null> {
        return this.attachmentRepository.getAttachmentById(attachmentId)
    }

    /**
     * Deletes all attachments for a specific test result
     * Removes both physical files and database records
     * @param testResultId - ID of the test result whose attachments should be deleted
     * @returns Number of deleted files
     */
    async deleteAttachmentsForTestResult(testResultId: string): Promise<number> {
        // Delete physical files from disk
        const deletedFiles = await this.attachmentManager.deleteTestAttachments(testResultId)
        // Delete database records explicitly (ensures cleanup independent of CASCADE)
        await this.attachmentRepository.deleteAttachmentsByTestResult(testResultId)
        return deletedFiles
    }

    /**
     * Clears all attachments from permanent storage
     * Used when clearing all test data to ensure physical files are deleted
     * @returns Statistics about deleted files
     */
    async clearAllAttachments(): Promise<{deletedFiles: number; freedSpace: number}> {
        return this.attachmentManager.clearAllAttachments()
    }
}

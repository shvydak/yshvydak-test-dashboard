import {NoteImage} from '@yshvydak/core'
import {NoteRepository, TestNote} from '../repositories/note.repository'
import {NoteImageRepository} from '../repositories/noteImage.repository'
import {AttachmentManager} from '../storage/attachmentManager'
import {Logger} from '../utils/logger.util'

export interface INoteService {
    saveNote(testId: string, content: string): Promise<void>
    getNote(testId: string): Promise<TestNote | null>
    deleteNote(testId: string): Promise<void>
    uploadImage(testId: string, buffer: Buffer, fileName: string): Promise<NoteImage>
    getImages(testId: string): Promise<NoteImage[]>
    deleteImage(imageId: string, testId: string): Promise<void>
}

export class NoteService implements INoteService {
    constructor(
        private noteRepository: NoteRepository,
        private noteImageRepository: NoteImageRepository,
        private attachmentManager: AttachmentManager
    ) {}

    async saveNote(testId: string, content: string): Promise<void> {
        try {
            // Trim content
            const trimmedContent = content.trim()

            // Validate content
            if (!trimmedContent) {
                throw new Error('Note content cannot be empty')
            }

            if (trimmedContent.length > 1000) {
                throw new Error('Note content exceeds maximum length of 1000 characters')
            }

            await this.noteRepository.saveNote(testId, trimmedContent)
            Logger.info(`Note saved for test ${testId}`)
        } catch (error) {
            Logger.error(`Failed to save note for test ${testId}`, error)
            throw error
        }
    }

    async getNote(testId: string): Promise<TestNote | null> {
        try {
            return await this.noteRepository.getNote(testId)
        } catch (error) {
            Logger.error(`Failed to get note for test ${testId}`, error)
            throw error
        }
    }

    async deleteNote(testId: string): Promise<void> {
        try {
            // Delete note images first
            const images = await this.noteImageRepository.getImages(testId)
            for (const image of images) {
                await this.attachmentManager.deleteNoteImage(testId, image.fileName)
            }
            await this.noteImageRepository.deleteImages(testId)

            // Then delete the note
            await this.noteRepository.deleteNote(testId)
            Logger.info(`Note deleted for test ${testId}`)
        } catch (error) {
            Logger.error(`Failed to delete note for test ${testId}`, error)
            throw error
        }
    }

    async uploadImage(testId: string, buffer: Buffer, fileName: string): Promise<NoteImage> {
        try {
            // Validate image type
            const validExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp']
            const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'))
            if (!validExtensions.includes(ext)) {
                throw new Error(
                    'Invalid image format. Supported formats: PNG, JPG, JPEG, GIF, WEBP'
                )
            }

            // Validate image size (max 5MB)
            const maxSize = 5 * 1024 * 1024
            if (buffer.length > maxSize) {
                throw new Error('Image size exceeds maximum limit of 5MB')
            }

            // Get current image count for position
            const existingImages = await this.noteImageRepository.getImages(testId)
            const position = existingImages.length

            // Save image file
            const metadata = await this.attachmentManager.saveNoteImage(buffer, testId, fileName)

            // Save image metadata to database
            const imageData = {
                id: metadata.id,
                testId,
                fileName: metadata.fileName,
                filePath: metadata.filePath,
                fileSize: metadata.fileSize,
                mimeType: metadata.mimeType,
                url: metadata.url,
                position,
            }

            await this.noteImageRepository.saveImage(imageData)

            Logger.info(`Image uploaded for test ${testId}: ${fileName}`)

            // Return complete image data
            const images = await this.noteImageRepository.getImages(testId)
            const savedImage = images.find((img) => img.id === metadata.id)
            if (!savedImage) {
                throw new Error('Failed to retrieve saved image')
            }

            return savedImage
        } catch (error) {
            Logger.error(`Failed to upload image for test ${testId}`, error)
            throw error
        }
    }

    async getImages(testId: string): Promise<NoteImage[]> {
        try {
            return await this.noteImageRepository.getImages(testId)
        } catch (error) {
            Logger.error(`Failed to get images for test ${testId}`, error)
            throw error
        }
    }

    async deleteImage(imageId: string, testId: string): Promise<void> {
        try {
            // Get image metadata
            const images = await this.noteImageRepository.getImages(testId)
            const image = images.find((img) => img.id === imageId)

            if (!image) {
                throw new Error('Image not found')
            }

            // Delete file from storage
            await this.attachmentManager.deleteNoteImage(testId, image.fileName)

            // Delete from database
            await this.noteImageRepository.deleteImage(imageId)

            Logger.info(`Image deleted for test ${testId}: ${imageId}`)
        } catch (error) {
            Logger.error(`Failed to delete image ${imageId} for test ${testId}`, error)
            throw error
        }
    }
}

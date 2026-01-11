import {NoteImageRepository, NoteImage} from '../repositories/noteImage.repository'
import {NoteRepository} from '../repositories/note.repository'
import {NoteImageManager} from '../storage/noteImageManager'
import {NoteImageData} from '../database/database.manager'
import {config} from '../config/environment.config'
import {Logger} from '../utils/logger.util'

export interface INoteImageService {
    uploadImage(testId: string, file: Express.Multer.File): Promise<NoteImage>
    getImages(testId: string): Promise<NoteImage[]>
    getImageById(imageId: string): Promise<NoteImage | null>
    deleteImage(imageId: string): Promise<void>
    deleteImagesByTestId(testId: string): Promise<void>
}

export class NoteImageService implements INoteImageService {
    private noteImageManager: NoteImageManager

    constructor(
        private noteImageRepository: NoteImageRepository,
        private noteRepository?: NoteRepository
    ) {
        this.noteImageManager = new NoteImageManager(config.storage.outputDir)
    }

    /**
     * Upload an image for a test note
     * @param testId - The test ID to associate the image with
     * @param file - The uploaded file from multer
     * @returns The created note image metadata
     */
    async uploadImage(testId: string, file: Express.Multer.File): Promise<NoteImage> {
        try {
            // Validate file type
            if (!file.mimetype.startsWith('image/')) {
                throw new Error('File must be an image')
            }

            // Validate file size (max 5MB)
            const maxSize = 5 * 1024 * 1024 // 5MB
            if (file.size > maxSize) {
                throw new Error('Image size exceeds maximum of 5MB')
            }

            // Ensure note exists (required for foreign key constraint)
            // Create empty note if it doesn't exist
            if (this.noteRepository) {
                const existingNote = await this.noteRepository.getNote(testId)
                if (!existingNote) {
                    // Create empty note with a space to satisfy NOT NULL constraint
                    // This will be updated when user saves the note
                    await this.noteRepository.saveNote(testId, ' ')
                    Logger.info(`Created placeholder note for test ${testId} before image upload`)
                }
            }

            // Save image to storage
            const metadata = await this.noteImageManager.saveImage(
                file.buffer,
                testId,
                file.originalname
            )

            // Save metadata to database
            const imageData: NoteImageData = {
                id: metadata.id,
                testId: metadata.testId,
                fileName: metadata.fileName,
                filePath: metadata.filePath,
                fileSize: metadata.fileSize,
                mimeType: metadata.mimeType,
                url: metadata.url,
            }

            await this.noteImageRepository.saveImage(imageData)

            Logger.info(`Image uploaded for test ${testId}: ${metadata.fileName}`)

            // Return formatted image data
            const savedImage = await this.noteImageRepository.getImageById(metadata.id)
            if (!savedImage) {
                throw new Error('Failed to retrieve uploaded image')
            }

            return savedImage
        } catch (error) {
            Logger.error(`Failed to upload image for test ${testId}`, error)
            throw error
        }
    }

    /**
     * Get all images for a test note
     * @param testId - The test ID
     * @returns Array of note images
     */
    async getImages(testId: string): Promise<NoteImage[]> {
        try {
            return await this.noteImageRepository.getImagesByTestId(testId)
        } catch (error) {
            Logger.error(`Failed to get images for test ${testId}`, error)
            throw error
        }
    }

    /**
     * Get a specific image by ID
     * @param imageId - The image ID
     * @returns The note image or null if not found
     */
    async getImageById(imageId: string): Promise<NoteImage | null> {
        try {
            return await this.noteImageRepository.getImageById(imageId)
        } catch (error) {
            Logger.error(`Failed to get image ${imageId}`, error)
            throw error
        }
    }

    /**
     * Delete an image
     * @param imageId - The image ID to delete
     */
    async deleteImage(imageId: string): Promise<void> {
        try {
            // Get image metadata to find file
            const image = await this.noteImageRepository.getImageById(imageId)
            if (!image) {
                throw new Error('Image not found')
            }

            // Delete physical file
            await this.noteImageManager.deleteImage(image.testId, image.fileName)

            // Delete database record
            await this.noteImageRepository.deleteImage(imageId)

            Logger.info(`Image deleted: ${imageId}`)
        } catch (error) {
            Logger.error(`Failed to delete image ${imageId}`, error)
            throw error
        }
    }

    /**
     * Delete all images for a test
     * @param testId - The test ID
     */
    async deleteImagesByTestId(testId: string): Promise<void> {
        try {
            // Delete physical files
            await this.noteImageManager.deleteImagesByTestId(testId)

            // Delete database records
            await this.noteImageRepository.deleteImagesByTestId(testId)

            Logger.info(`All images deleted for test ${testId}`)
        } catch (error) {
            Logger.error(`Failed to delete images for test ${testId}`, error)
            throw error
        }
    }
}

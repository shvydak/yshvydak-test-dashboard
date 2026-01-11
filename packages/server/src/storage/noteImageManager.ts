import fs from 'fs'
import path from 'path'
import {v4 as uuidv4} from 'uuid'
import {Logger} from '../utils/logger.util'

export interface NoteImageMetadata {
    id: string
    testId: string
    fileName: string
    filePath: string
    fileSize: number
    mimeType: string
    url: string
}

export class NoteImageManager {
    private noteImagesDir: string

    constructor(baseDir: string) {
        this.noteImagesDir = path.join(baseDir, 'note-images')
        this.ensureDirectoryExists()
    }

    private ensureDirectoryExists(): void {
        if (!fs.existsSync(this.noteImagesDir)) {
            fs.mkdirSync(this.noteImagesDir, {recursive: true})
            Logger.info(`Created note-images directory: ${this.noteImagesDir}`)
        }
    }

    private ensureTestDirectory(testId: string): string {
        const testDir = path.join(this.noteImagesDir, testId)
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, {recursive: true})
        }
        return testDir
    }

    private getMimeType(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase()

        const mimeTypes: {[key: string]: string} = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp',
            '.svg': 'image/svg+xml',
        }

        return mimeTypes[ext] || 'image/png'
    }

    private generateFileName(originalFileName?: string): string {
        const timestamp = Date.now()
        const random = Math.random().toString(36).substring(2, 8)

        if (originalFileName) {
            const ext = path.extname(originalFileName).toLowerCase()
            // Ensure we have a valid image extension
            const validExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']
            const finalExt = validExts.includes(ext) ? ext : '.png'
            const name = path.basename(originalFileName, path.extname(originalFileName))
            return `${name}-${timestamp}-${random}${finalExt}`
        }

        return `image-${timestamp}-${random}.png`
    }

    // Save image from buffer
    async saveImage(buffer: Buffer, testId: string, fileName?: string): Promise<NoteImageMetadata> {
        const testDir = this.ensureTestDirectory(testId)
        const finalFileName = fileName || this.generateFileName()
        const filePath = path.join(testDir, finalFileName)

        // Write buffer to file
        await fs.promises.writeFile(filePath, buffer)

        const mimeType = this.getMimeType(filePath)
        const imageId = uuidv4()

        const metadata: NoteImageMetadata = {
            id: imageId,
            testId,
            fileName: finalFileName,
            filePath,
            fileSize: buffer.length,
            mimeType,
            url: this.generateUrl(testId, finalFileName),
        }

        Logger.info(`Saved note image: ${filePath}`)
        return metadata
    }

    // Generate URL for accessing image
    generateUrl(testId: string, fileName: string): string {
        // This will be served by Express static middleware
        return `/note-images/${testId}/${fileName}`
    }

    // Get image file path
    getImagePath(testId: string, fileName: string): string {
        return path.join(this.noteImagesDir, testId, fileName)
    }

    // Check if image file exists
    imageExists(testId: string, fileName: string): boolean {
        const filePath = this.getImagePath(testId, fileName)
        return fs.existsSync(filePath)
    }

    // Delete image file
    async deleteImage(testId: string, fileName: string): Promise<boolean> {
        const filePath = this.getImagePath(testId, fileName)

        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath)
            Logger.info(`Deleted note image: ${filePath}`)

            // Check if test directory is empty and remove it
            const testDir = path.join(this.noteImagesDir, testId)
            try {
                const files = await fs.promises.readdir(testDir)
                if (files.length === 0) {
                    await fs.promises.rmdir(testDir)
                    Logger.info(`Removed empty test directory: ${testDir}`)
                }
            } catch {
                // Directory might not be empty or might not exist, ignore
            }

            return true
        }

        return false
    }

    // Delete all images for a test
    async deleteImagesByTestId(testId: string): Promise<number> {
        const testDir = path.join(this.noteImagesDir, testId)

        if (!fs.existsSync(testDir)) {
            return 0
        }

        const files = await fs.promises.readdir(testDir)
        let deletedCount = 0

        for (const file of files) {
            const filePath = path.join(testDir, file)
            await fs.promises.unlink(filePath)
            deletedCount++
        }

        // Remove the directory
        await fs.promises.rmdir(testDir)
        Logger.info(`Deleted ${deletedCount} images for test ${testId}`)

        return deletedCount
    }
}

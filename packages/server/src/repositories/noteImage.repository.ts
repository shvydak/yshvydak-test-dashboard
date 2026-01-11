import {BaseRepository} from './base.repository'
import {NoteImageData} from '../database/database.manager'

export interface NoteImage {
    id: string
    testId: string
    fileName: string
    filePath: string
    fileSize: number
    mimeType: string
    url: string
    createdAt: string
}

export interface INoteImageRepository {
    saveImage(imageData: NoteImageData): Promise<void>
    getImagesByTestId(testId: string): Promise<NoteImage[]>
    getImageById(imageId: string): Promise<NoteImage | null>
    deleteImage(imageId: string): Promise<void>
    deleteImagesByTestId(testId: string): Promise<void>
}

export class NoteImageRepository extends BaseRepository implements INoteImageRepository {
    async saveImage(imageData: NoteImageData): Promise<void> {
        await this.dbManager.saveNoteImage(imageData)
    }

    async getImagesByTestId(testId: string): Promise<NoteImage[]> {
        const rows = await this.dbManager.getNoteImages(testId)

        return rows.map((row) => ({
            id: row.id,
            testId: row.test_id,
            fileName: row.file_name,
            filePath: row.file_path,
            fileSize: row.file_size,
            mimeType: row.mime_type,
            url: row.url,
            createdAt: row.created_at,
        }))
    }

    async getImageById(imageId: string): Promise<NoteImage | null> {
        const row = await this.dbManager.getNoteImage(imageId)

        if (!row) return null

        return {
            id: row.id,
            testId: row.test_id,
            fileName: row.file_name,
            filePath: row.file_path,
            fileSize: row.file_size,
            mimeType: row.mime_type,
            url: row.url,
            createdAt: row.created_at,
        }
    }

    async deleteImage(imageId: string): Promise<void> {
        await this.dbManager.deleteNoteImage(imageId)
    }

    async deleteImagesByTestId(testId: string): Promise<void> {
        await this.dbManager.deleteNoteImagesByTestId(testId)
    }
}

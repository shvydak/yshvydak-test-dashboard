import {NoteImage} from '@yshvydak/core'
import {BaseRepository} from './base.repository'

export interface INoteImageRepository {
    saveImage(imageData: {
        id: string
        testId: string
        fileName: string
        filePath: string
        fileSize: number
        mimeType?: string
        url: string
        position: number
    }): Promise<void>
    getImages(testId: string): Promise<NoteImage[]>
    deleteImage(id: string): Promise<void>
    deleteImages(testId: string): Promise<void>
}

export class NoteImageRepository extends BaseRepository implements INoteImageRepository {
    async saveImage(imageData: {
        id: string
        testId: string
        fileName: string
        filePath: string
        fileSize: number
        mimeType?: string
        url: string
        position: number
    }): Promise<void> {
        await this.dbManager.saveNoteImage(imageData)
    }

    async getImages(testId: string): Promise<NoteImage[]> {
        const rows = await this.dbManager.getNoteImages(testId)

        return rows.map((row) => ({
            id: row.id,
            testId: row.test_id,
            fileName: row.file_name,
            filePath: row.file_path,
            fileSize: row.file_size,
            mimeType: row.mime_type,
            url: row.url,
            position: row.position,
            createdAt: row.created_at,
        }))
    }

    async deleteImage(id: string): Promise<void> {
        await this.dbManager.deleteNoteImage(id)
    }

    async deleteImages(testId: string): Promise<void> {
        await this.dbManager.deleteNoteImages(testId)
    }
}

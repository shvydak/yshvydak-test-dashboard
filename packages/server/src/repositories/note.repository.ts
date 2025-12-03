import {BaseRepository} from './base.repository'
import {TestNoteData} from '../database/database.manager'

export interface TestNote {
    testId: string
    content: string
    createdAt: string
    updatedAt: string
}

export interface INoteRepository {
    saveNote(testId: string, content: string): Promise<void>
    getNote(testId: string): Promise<TestNote | null>
    deleteNote(testId: string): Promise<void>
}

export class NoteRepository extends BaseRepository implements INoteRepository {
    async saveNote(testId: string, content: string): Promise<void> {
        if (content.length > 1000) {
            throw new Error('Note content exceeds maximum length of 1000 characters')
        }

        const noteData: TestNoteData = {
            testId,
            content,
        }

        await this.dbManager.saveTestNote(noteData)
    }

    async getNote(testId: string): Promise<TestNote | null> {
        const row = await this.dbManager.getTestNote(testId)

        if (!row) return null

        return {
            testId: row.test_id,
            content: row.content,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }
    }

    async deleteNote(testId: string): Promise<void> {
        await this.dbManager.deleteTestNote(testId)
    }
}

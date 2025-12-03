import {NoteRepository, TestNote} from '../repositories/note.repository'
import {Logger} from '../utils/logger.util'

export interface INoteService {
    saveNote(testId: string, content: string): Promise<void>
    getNote(testId: string): Promise<TestNote | null>
    deleteNote(testId: string): Promise<void>
}

export class NoteService implements INoteService {
    constructor(private noteRepository: NoteRepository) {}

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
            await this.noteRepository.deleteNote(testId)
            Logger.info(`Note deleted for test ${testId}`)
        } catch (error) {
            Logger.error(`Failed to delete note for test ${testId}`, error)
            throw error
        }
    }
}

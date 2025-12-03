import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {NoteRepository} from '../note.repository'
import {DatabaseManager} from '../../database/database.manager'

describe('NoteRepository', () => {
    let noteRepository: NoteRepository
    let dbManager: DatabaseManager

    beforeEach(async () => {
        dbManager = new DatabaseManager(':memory:')
        await dbManager.initialize()
        noteRepository = new NoteRepository(dbManager)
    })

    afterEach(async () => {
        await dbManager.close()
    })

    describe('saveNote()', () => {
        it('should save a new note', async () => {
            const testId = 'test-123'
            const content = 'This is a test note'

            await noteRepository.saveNote(testId, content)

            const note = await noteRepository.getNote(testId)
            expect(note).not.toBeNull()
            expect(note?.testId).toBe(testId)
            expect(note?.content).toBe(content)
        })

        it('should update existing note', async () => {
            const testId = 'test-123'
            const originalContent = 'Original note'
            const updatedContent = 'Updated note'

            await noteRepository.saveNote(testId, originalContent)
            const originalNote = await noteRepository.getNote(testId)
            expect(originalNote?.content).toBe(originalContent)

            await noteRepository.saveNote(testId, updatedContent)
            const updatedNote = await noteRepository.getNote(testId)
            expect(updatedNote?.content).toBe(updatedContent)
            expect(updatedNote?.testId).toBe(testId)
        })

        it('should reject notes exceeding 1000 characters', async () => {
            const testId = 'test-123'
            const longContent = 'a'.repeat(1001)

            await expect(noteRepository.saveNote(testId, longContent)).rejects.toThrow(
                'Note content exceeds maximum length of 1000 characters'
            )
        })

        it('should accept notes at exactly 1000 characters', async () => {
            const testId = 'test-123'
            const content = 'a'.repeat(1000)

            await expect(noteRepository.saveNote(testId, content)).resolves.not.toThrow()

            const note = await noteRepository.getNote(testId)
            expect(note?.content).toBe(content)
            expect(note?.content.length).toBe(1000)
        })

        it('should handle notes with special characters and URLs', async () => {
            const testId = 'test-123'
            const content = 'Check bug report: https://example.com/issue/123 & test@email.com'

            await noteRepository.saveNote(testId, content)

            const note = await noteRepository.getNote(testId)
            expect(note?.content).toBe(content)
        })

        it('should handle notes with newlines', async () => {
            const testId = 'test-123'
            const content = 'Line 1\nLine 2\nLine 3'

            await noteRepository.saveNote(testId, content)

            const note = await noteRepository.getNote(testId)
            expect(note?.content).toBe(content)
        })
    })

    describe('getNote()', () => {
        it('should retrieve existing note', async () => {
            const testId = 'test-123'
            const content = 'Test note content'

            await noteRepository.saveNote(testId, content)
            const note = await noteRepository.getNote(testId)

            expect(note).not.toBeNull()
            expect(note?.testId).toBe(testId)
            expect(note?.content).toBe(content)
            expect(note?.createdAt).toBeDefined()
            expect(note?.updatedAt).toBeDefined()
        })

        it('should return null for non-existent note', async () => {
            const note = await noteRepository.getNote('non-existent-test')

            expect(note).toBeNull()
        })

        it('should return note with correct timestamps', async () => {
            const testId = 'test-123'
            const content = 'Test note'

            await noteRepository.saveNote(testId, content)
            const note = await noteRepository.getNote(testId)

            expect(note?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}/)
            expect(note?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}/)
        })
    })

    describe('deleteNote()', () => {
        it('should delete existing note', async () => {
            const testId = 'test-123'
            const content = 'Test note to delete'

            await noteRepository.saveNote(testId, content)
            let note = await noteRepository.getNote(testId)
            expect(note).not.toBeNull()

            await noteRepository.deleteNote(testId)
            note = await noteRepository.getNote(testId)
            expect(note).toBeNull()
        })

        it('should not throw error when deleting non-existent note', async () => {
            await expect(noteRepository.deleteNote('non-existent-test')).resolves.not.toThrow()
        })

        it('should allow creating note after deletion', async () => {
            const testId = 'test-123'
            const originalContent = 'Original note'
            const newContent = 'New note after deletion'

            await noteRepository.saveNote(testId, originalContent)
            await noteRepository.deleteNote(testId)
            await noteRepository.saveNote(testId, newContent)

            const note = await noteRepository.getNote(testId)
            expect(note?.content).toBe(newContent)
        })
    })

    describe('Edge Cases', () => {
        it('should handle empty testId gracefully', async () => {
            await expect(noteRepository.saveNote('', 'content')).resolves.not.toThrow()
        })

        it('should handle multiple notes for different tests', async () => {
            const notes = [
                {testId: 'test-1', content: 'Note 1'},
                {testId: 'test-2', content: 'Note 2'},
                {testId: 'test-3', content: 'Note 3'},
            ]

            for (const {testId, content} of notes) {
                await noteRepository.saveNote(testId, content)
            }

            for (const {testId, content} of notes) {
                const note = await noteRepository.getNote(testId)
                expect(note?.content).toBe(content)
            }
        })

        it('should update updatedAt timestamp on note update', async () => {
            const testId = 'test-123'

            await noteRepository.saveNote(testId, 'Original content')
            const originalNote = await noteRepository.getNote(testId)

            // Delay to ensure timestamp difference (SQLite CURRENT_TIMESTAMP has second precision)
            await new Promise((resolve) => setTimeout(resolve, 1100))

            await noteRepository.saveNote(testId, 'Updated content')
            const updatedNote = await noteRepository.getNote(testId)

            expect(updatedNote?.updatedAt).not.toBe(originalNote?.updatedAt)
        })
    })
})

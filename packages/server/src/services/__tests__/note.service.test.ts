import {describe, it, expect, beforeEach, vi} from 'vitest'
import {NoteService} from '../note.service'
import {NoteRepository, TestNote} from '../../repositories/note.repository'

describe('NoteService', () => {
    let noteService: NoteService
    let mockNoteRepository: NoteRepository

    beforeEach(() => {
        mockNoteRepository = {
            saveNote: vi.fn(),
            getNote: vi.fn(),
            deleteNote: vi.fn(),
        } as unknown as NoteRepository

        noteService = new NoteService(mockNoteRepository)
    })

    describe('saveNote()', () => {
        it('should save note with trimmed content', async () => {
            const testId = 'test-123'
            const content = '  Test note with spaces  '

            await noteService.saveNote(testId, content)

            expect(mockNoteRepository.saveNote).toHaveBeenCalledWith(
                testId,
                'Test note with spaces'
            )
        })

        it('should reject empty content', async () => {
            const testId = 'test-123'
            const content = ''

            await expect(noteService.saveNote(testId, content)).rejects.toThrow(
                'Note content cannot be empty'
            )

            expect(mockNoteRepository.saveNote).not.toHaveBeenCalled()
        })

        it('should reject whitespace-only content', async () => {
            const testId = 'test-123'
            const content = '   \n\t   '

            await expect(noteService.saveNote(testId, content)).rejects.toThrow(
                'Note content cannot be empty'
            )

            expect(mockNoteRepository.saveNote).not.toHaveBeenCalled()
        })

        it('should reject content exceeding 1000 characters', async () => {
            const testId = 'test-123'
            const content = 'a'.repeat(1001)

            await expect(noteService.saveNote(testId, content)).rejects.toThrow(
                'Note content exceeds maximum length of 1000 characters'
            )

            expect(mockNoteRepository.saveNote).not.toHaveBeenCalled()
        })

        it('should accept content at exactly 1000 characters', async () => {
            const testId = 'test-123'
            const content = 'a'.repeat(1000)

            await noteService.saveNote(testId, content)

            expect(mockNoteRepository.saveNote).toHaveBeenCalledWith(testId, content)
        })

        it('should accept content with URLs', async () => {
            const testId = 'test-123'
            const content = 'Check issue: https://example.com/issue/123'

            await noteService.saveNote(testId, content)

            expect(mockNoteRepository.saveNote).toHaveBeenCalledWith(testId, content)
        })

        it('should accept content with special characters', async () => {
            const testId = 'test-123'
            const content = 'Test with special chars: @#$%^&*()[]{}|\\<>?'

            await noteService.saveNote(testId, content)

            expect(mockNoteRepository.saveNote).toHaveBeenCalledWith(testId, content)
        })

        it('should propagate repository errors', async () => {
            const testId = 'test-123'
            const content = 'Test note'
            const error = new Error('Database error')

            vi.mocked(mockNoteRepository.saveNote).mockRejectedValue(error)

            await expect(noteService.saveNote(testId, content)).rejects.toThrow('Database error')
        })
    })

    describe('getNote()', () => {
        it('should retrieve note from repository', async () => {
            const testId = 'test-123'
            const mockNote: TestNote = {
                testId,
                content: 'Test note content',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            }

            vi.mocked(mockNoteRepository.getNote).mockResolvedValue(mockNote)

            const result = await noteService.getNote(testId)

            expect(mockNoteRepository.getNote).toHaveBeenCalledWith(testId)
            expect(result).toEqual(mockNote)
        })

        it('should return null for non-existent note', async () => {
            const testId = 'non-existent'

            vi.mocked(mockNoteRepository.getNote).mockResolvedValue(null)

            const result = await noteService.getNote(testId)

            expect(mockNoteRepository.getNote).toHaveBeenCalledWith(testId)
            expect(result).toBeNull()
        })

        it('should propagate repository errors', async () => {
            const testId = 'test-123'
            const error = new Error('Database error')

            vi.mocked(mockNoteRepository.getNote).mockRejectedValue(error)

            await expect(noteService.getNote(testId)).rejects.toThrow('Database error')
        })
    })

    describe('deleteNote()', () => {
        it('should delete note from repository', async () => {
            const testId = 'test-123'

            await noteService.deleteNote(testId)

            expect(mockNoteRepository.deleteNote).toHaveBeenCalledWith(testId)
        })

        it('should handle deletion of non-existent note', async () => {
            const testId = 'non-existent'

            await expect(noteService.deleteNote(testId)).resolves.not.toThrow()

            expect(mockNoteRepository.deleteNote).toHaveBeenCalledWith(testId)
        })

        it('should propagate repository errors', async () => {
            const testId = 'test-123'
            const error = new Error('Database error')

            vi.mocked(mockNoteRepository.deleteNote).mockRejectedValue(error)

            await expect(noteService.deleteNote(testId)).rejects.toThrow('Database error')
        })
    })

    describe('Validation Logic', () => {
        it('should trim leading and trailing whitespace before validation', async () => {
            const testId = 'test-123'
            const content = '  \n\t Test content \t\n  '

            await noteService.saveNote(testId, content)

            expect(mockNoteRepository.saveNote).toHaveBeenCalledWith(testId, 'Test content')
        })

        it('should validate length after trimming', async () => {
            const testId = 'test-123'
            const content = '  ' + 'a'.repeat(1001) + '  '

            await expect(noteService.saveNote(testId, content)).rejects.toThrow(
                'Note content exceeds maximum length'
            )

            expect(mockNoteRepository.saveNote).not.toHaveBeenCalled()
        })

        it('should preserve internal whitespace', async () => {
            const testId = 'test-123'
            const content = '  Line 1\n  Line 2\n  Line 3  '

            await noteService.saveNote(testId, content)

            expect(mockNoteRepository.saveNote).toHaveBeenCalledWith(
                testId,
                'Line 1\n  Line 2\n  Line 3'
            )
        })
    })
})

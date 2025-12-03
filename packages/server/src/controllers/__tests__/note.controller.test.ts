import {describe, it, expect, beforeEach, vi} from 'vitest'
import {Response} from 'express'
import {NoteController} from '../note.controller'
import {NoteService} from '../../services/note.service'
import {TestNote} from '../../repositories/note.repository'

describe('NoteController', () => {
    let noteController: NoteController
    let mockNoteService: NoteService
    let mockRequest: any
    let mockResponse: Partial<Response>

    beforeEach(() => {
        mockNoteService = {
            saveNote: vi.fn(),
            getNote: vi.fn(),
            deleteNote: vi.fn(),
        } as unknown as NoteService

        noteController = new NoteController(mockNoteService)

        mockRequest = {
            params: {},
            body: {},
        }

        mockResponse = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        }
    })

    describe('getNote()', () => {
        it('should return note with 200 status when note exists', async () => {
            const testId = 'test-123'
            const mockNote: TestNote = {
                testId,
                content: 'Test note content',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            }

            mockRequest.params = {testId}
            vi.mocked(mockNoteService.getNote).mockResolvedValue(mockNote)

            await noteController.getNote(mockRequest, mockResponse as Response)

            expect(mockNoteService.getNote).toHaveBeenCalledWith(testId)
            expect(mockResponse.status).toHaveBeenCalledWith(200)
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: mockNote,
                })
            )
        })

        it('should return null with 200 status when note does not exist', async () => {
            const testId = 'non-existent'

            mockRequest.params = {testId}
            vi.mocked(mockNoteService.getNote).mockResolvedValue(null)

            await noteController.getNote(mockRequest, mockResponse as Response)

            expect(mockNoteService.getNote).toHaveBeenCalledWith(testId)
            expect(mockResponse.status).toHaveBeenCalledWith(200)
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: null,
                })
            )
        })

        it('should return 500 status on service error', async () => {
            const testId = 'test-123'
            const error = new Error('Database error')

            mockRequest.params = {testId}
            vi.mocked(mockNoteService.getNote).mockRejectedValue(error)

            await noteController.getNote(mockRequest, mockResponse as Response)

            expect(mockResponse.status).toHaveBeenCalledWith(500)
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Failed to get note',
                })
            )
        })
    })

    describe('saveNote()', () => {
        it('should save note and return success response', async () => {
            const testId = 'test-123'
            const content = 'Test note content'

            mockRequest.params = {testId}
            mockRequest.body = {content}

            await noteController.saveNote(mockRequest as any, mockResponse as Response)

            expect(mockNoteService.saveNote).toHaveBeenCalledWith(testId, content)
            expect(mockResponse.status).toHaveBeenCalledWith(200)
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: {message: 'Note saved successfully'},
                })
            )
        })

        it('should return 400 status when content is missing', async () => {
            const testId = 'test-123'

            mockRequest.params = {testId}
            mockRequest.body = {}

            await noteController.saveNote(mockRequest as any, mockResponse as Response)

            expect(mockNoteService.saveNote).not.toHaveBeenCalled()
            expect(mockResponse.status).toHaveBeenCalledWith(400)
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Invalid content',
                    error: 'Content must be a string',
                })
            )
        })

        it('should return 400 status when content is not a string', async () => {
            const testId = 'test-123'

            mockRequest.params = {testId}
            mockRequest.body = {content: 123}

            await noteController.saveNote(mockRequest as any, mockResponse as Response)

            expect(mockNoteService.saveNote).not.toHaveBeenCalled()
            expect(mockResponse.status).toHaveBeenCalledWith(400)
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Invalid content',
                    error: 'Content must be a string',
                })
            )
        })

        it('should return 400 status when service validation fails', async () => {
            const testId = 'test-123'
            const content = ''
            const error = new Error('Note content cannot be empty')

            mockRequest.params = {testId}
            mockRequest.body = {content}
            vi.mocked(mockNoteService.saveNote).mockRejectedValue(error)

            await noteController.saveNote(mockRequest, mockResponse as Response)

            expect(mockResponse.status).toHaveBeenCalledWith(500)
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Note content cannot be empty',
                    message: 'Failed to save note',
                })
            )
        })

        it('should return 500 status on unexpected error', async () => {
            const testId = 'test-123'
            const content = 'Test note'
            const error = new Error('Database connection failed')

            mockRequest.params = {testId}
            mockRequest.body = {content}
            vi.mocked(mockNoteService.saveNote).mockRejectedValue(error)

            await noteController.saveNote(mockRequest, mockResponse as Response)

            expect(mockResponse.status).toHaveBeenCalledWith(500)
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Database connection failed',
                    message: 'Failed to save note',
                })
            )
        })
    })

    describe('deleteNote()', () => {
        it('should delete note and return 200 status', async () => {
            const testId = 'test-123'

            mockRequest.params = {testId}

            await noteController.deleteNote(mockRequest, mockResponse as Response)

            expect(mockNoteService.deleteNote).toHaveBeenCalledWith(testId)
            expect(mockResponse.status).toHaveBeenCalledWith(200)
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: {message: 'Note deleted successfully'},
                })
            )
        })

        it('should return 200 status even when note does not exist', async () => {
            const testId = 'non-existent'

            mockRequest.params = {testId}

            await noteController.deleteNote(mockRequest, mockResponse as Response)

            expect(mockNoteService.deleteNote).toHaveBeenCalledWith(testId)
            expect(mockResponse.status).toHaveBeenCalledWith(200)
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: {message: 'Note deleted successfully'},
                })
            )
        })

        it('should return 500 status on service error', async () => {
            const testId = 'test-123'
            const error = new Error('Database error')

            mockRequest.params = {testId}
            vi.mocked(mockNoteService.deleteNote).mockRejectedValue(error)

            await noteController.deleteNote(mockRequest, mockResponse as Response)

            expect(mockResponse.status).toHaveBeenCalledWith(500)
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Failed to delete note',
                })
            )
        })
    })

    describe('Request Parameter Extraction', () => {
        it('should extract testId from request params correctly', async () => {
            const testId = 'test-with-special-chars-123'

            mockRequest.params = {testId}
            vi.mocked(mockNoteService.getNote).mockResolvedValue(null)

            await noteController.getNote(mockRequest, mockResponse as Response)

            expect(mockNoteService.getNote).toHaveBeenCalledWith(testId)
        })

        it('should handle multiple parameters correctly', async () => {
            const testId = 'test-123'
            const content = 'Note with URL: https://example.com'

            mockRequest.params = {testId, otherparam: 'ignored'}
            mockRequest.body = {content, otherfield: 'ignored'}

            await noteController.saveNote(mockRequest, mockResponse as Response)

            expect(mockNoteService.saveNote).toHaveBeenCalledWith(testId, content)
        })
    })
})

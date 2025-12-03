import {Response} from 'express'
import {NoteService} from '../services/note.service'
import {ResponseHelper} from '../utils/response.helper'
import {Logger} from '../utils/logger.util'
import {ServiceRequest} from '../types/api.types'

export class NoteController {
    constructor(private noteService: NoteService) {}

    // GET /api/tests/:testId/notes - Get note for a test
    getNote = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const {testId} = req.params

            if (!testId) {
                return ResponseHelper.error(res, 'Test ID is required', 'Missing test ID', 400)
            }

            const note = await this.noteService.getNote(testId)

            if (!note) {
                return ResponseHelper.success(res, null)
            }

            return ResponseHelper.success(res, note)
        } catch (error) {
            Logger.error('Error getting note', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to get note',
                500
            )
        }
    }

    // POST /api/tests/:testId/notes - Save note for a test
    saveNote = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const {testId} = req.params
            const {content} = req.body

            if (!testId) {
                return ResponseHelper.error(res, 'Test ID is required', 'Missing test ID', 400)
            }

            if (typeof content !== 'string') {
                return ResponseHelper.error(res, 'Content must be a string', 'Invalid content', 400)
            }

            await this.noteService.saveNote(testId, content)

            return ResponseHelper.success(res, {message: 'Note saved successfully'})
        } catch (error) {
            Logger.error('Error saving note', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to save note',
                500
            )
        }
    }

    // DELETE /api/tests/:testId/notes - Delete note for a test
    deleteNote = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const {testId} = req.params

            if (!testId) {
                return ResponseHelper.error(res, 'Test ID is required', 'Missing test ID', 400)
            }

            await this.noteService.deleteNote(testId)

            return ResponseHelper.success(res, {message: 'Note deleted successfully'})
        } catch (error) {
            Logger.error('Error deleting note', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to delete note',
                500
            )
        }
    }
}

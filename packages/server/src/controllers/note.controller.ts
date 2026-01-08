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

    // POST /api/tests/:testId/notes/images - Upload image(s) for a note
    uploadImages = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const {testId} = req.params

            if (!testId) {
                return ResponseHelper.error(res, 'Test ID is required', 'Missing test ID', 400)
            }

            if (!req.files || (Array.isArray(req.files) && req.files.length === 0)) {
                return ResponseHelper.error(res, 'No images provided', 'Missing images', 400)
            }

            const files = Array.isArray(req.files)
                ? req.files
                : req.files?.image
                  ? [req.files.image]
                  : []
            const uploadedImages = []

            for (const file of files) {
                if (!file || Array.isArray(file)) continue

                const image = await this.noteService.uploadImage(
                    testId,
                    file.buffer,
                    file.originalname
                )
                uploadedImages.push(image)
            }

            return ResponseHelper.success(res, {
                message: `${uploadedImages.length} image(s) uploaded successfully`,
                images: uploadedImages,
            })
        } catch (error) {
            Logger.error('Error uploading images', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to upload images',
                500
            )
        }
    }

    // GET /api/tests/:testId/notes/images - Get all images for a note
    getImages = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const {testId} = req.params

            if (!testId) {
                return ResponseHelper.error(res, 'Test ID is required', 'Missing test ID', 400)
            }

            const images = await this.noteService.getImages(testId)

            return ResponseHelper.success(res, images)
        } catch (error) {
            Logger.error('Error getting images', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to get images',
                500
            )
        }
    }

    // DELETE /api/tests/:testId/notes/images/:imageId - Delete specific image
    deleteImage = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const {testId, imageId} = req.params

            if (!testId) {
                return ResponseHelper.error(res, 'Test ID is required', 'Missing test ID', 400)
            }

            if (!imageId) {
                return ResponseHelper.error(res, 'Image ID is required', 'Missing image ID', 400)
            }

            await this.noteService.deleteImage(imageId, testId)

            return ResponseHelper.success(res, {message: 'Image deleted successfully'})
        } catch (error) {
            Logger.error('Error deleting image', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to delete image',
                500
            )
        }
    }
}

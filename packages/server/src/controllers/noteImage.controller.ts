import {Response} from 'express'
import {NoteImageService} from '../services/noteImage.service'
import {ResponseHelper} from '../utils/response.helper'
import {Logger} from '../utils/logger.util'
import {ServiceRequest} from '../types/api.types'

export class NoteImageController {
    constructor(private noteImageService: NoteImageService) {}

    // POST /api/tests/:testId/notes/images - Upload image for a test note
    uploadImage = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const {testId} = req.params
            const file = req.file

            if (!testId) {
                return ResponseHelper.error(res, 'Test ID is required', 'Missing test ID', 400)
            }

            if (!file) {
                return ResponseHelper.error(
                    res,
                    'Image file is required',
                    'Missing image file',
                    400
                )
            }

            const image = await this.noteImageService.uploadImage(testId, file)

            return ResponseHelper.success(res, image)
        } catch (error) {
            Logger.error('Error uploading image', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to upload image',
                500
            )
        }
    }

    // GET /api/tests/:testId/notes/images - Get all images for a test note
    getImages = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const {testId} = req.params

            if (!testId) {
                return ResponseHelper.error(res, 'Test ID is required', 'Missing test ID', 400)
            }

            const images = await this.noteImageService.getImages(testId)

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

    // DELETE /api/tests/:testId/notes/images/:imageId - Delete an image
    deleteImage = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const {testId, imageId} = req.params

            if (!testId) {
                return ResponseHelper.error(res, 'Test ID is required', 'Missing test ID', 400)
            }

            if (!imageId) {
                return ResponseHelper.error(res, 'Image ID is required', 'Missing image ID', 400)
            }

            await this.noteImageService.deleteImage(imageId)

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

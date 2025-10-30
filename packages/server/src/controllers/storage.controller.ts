import {Response} from 'express'
import {StorageService} from '../services/storage.service'
import {ResponseHelper} from '../utils/response.helper'
import {Logger} from '../utils/logger.util'
import {ServiceRequest} from '../types/api.types'

export class StorageController {
    constructor(private storageService: StorageService) {}

    // GET /api/storage/stats - Get storage statistics
    getStorageStats = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const stats = await this.storageService.getStorageStats()
            return ResponseHelper.success(res, stats)
        } catch (error) {
            Logger.error('Error retrieving storage stats', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to retrieve storage statistics',
                500
            )
        }
    }
}

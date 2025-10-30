import {StorageRepository, StorageStats} from '../repositories/storage.repository'
import {Logger} from '../utils/logger.util'

export interface IStorageService {
    getStorageStats(): Promise<StorageStats>
}

export class StorageService implements IStorageService {
    constructor(private storageRepository: StorageRepository) {}

    async getStorageStats(): Promise<StorageStats> {
        try {
            const stats = await this.storageRepository.getStorageStats()

            Logger.info('Storage stats retrieved', {
                totalSize: stats.total.size,
                databaseSize: stats.database.size,
                attachmentsSize: stats.attachments.totalSize,
            })

            return stats
        } catch (error) {
            Logger.error('Failed to retrieve storage stats', error)
            throw new Error('Failed to retrieve storage statistics')
        }
    }
}

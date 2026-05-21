import {BaseRepository} from './base.repository'
import {AttachmentManager} from '../storage/attachmentManager'
import {config} from '../config/environment.config'
import {Logger} from '../utils/logger.util'
import path from 'path'
import fs from 'fs'

export interface StorageStats {
    database: {
        size: number // bytes
        totalRuns: number
        totalResults: number
        totalAttachments: number
    }
    attachments: {
        totalSize: number // bytes
        totalFiles: number
        testDirectories: number
        typeBreakdown: {
            video: {count: number; size: number}
            screenshot: {count: number; size: number}
            trace: {count: number; size: number}
            log: {count: number; size: number}
            other: {count: number; size: number}
        }
    }
    total: {
        size: number // bytes
        averageSizePerTest: number // bytes
    }
    disk: {
        totalSpace: number // bytes
        availableSpace: number // bytes
        percentFree: number // percentage (0-100)
    }
}

export interface IStorageRepository {
    getStorageStats(): Promise<StorageStats>
}

export class StorageRepository extends BaseRepository implements IStorageRepository {
    private attachmentManager: AttachmentManager

    constructor(dbManager: any, attachmentManager: AttachmentManager) {
        super(dbManager)
        this.attachmentManager = attachmentManager
    }

    async getStorageStats(): Promise<StorageStats> {
        // Get database stats
        const dbStats = await this.getDatabaseStats()

        // Get attachment stats
        const rawAttachmentStats = await this.attachmentManager.getStorageStats()

        // Transform typeBreakdown to match expected structure
        const typeBreakdown = {
            video: rawAttachmentStats.typeBreakdown['video'] || {count: 0, size: 0},
            screenshot: rawAttachmentStats.typeBreakdown['screenshot'] || {count: 0, size: 0},
            trace: rawAttachmentStats.typeBreakdown['trace'] || {count: 0, size: 0},
            log: rawAttachmentStats.typeBreakdown['log'] || {count: 0, size: 0},
            other: rawAttachmentStats.typeBreakdown['other'] || {count: 0, size: 0},
        }

        // Calculate total
        const totalSize = dbStats.size + rawAttachmentStats.totalSize

        // Calculate average size per test execution
        const averageSizePerTest =
            dbStats.totalResults > 0 ? Math.round(totalSize / dbStats.totalResults) : 0

        // Get disk space stats
        let diskPath = config.storage.outputDir
        if (diskPath === ':memory:' || !fs.existsSync(diskPath)) {
            diskPath = process.cwd()
        }

        let diskStats = {
            totalSpace: 0,
            availableSpace: 0,
            percentFree: 0,
        }

        try {
            const fsStats = await fs.promises.statfs(diskPath)
            const totalSpace = fsStats.bsize * fsStats.blocks
            const availableSpace = fsStats.bsize * fsStats.bavail
            const percentFree = totalSpace > 0 ? Math.round((availableSpace / totalSpace) * 100) : 0
            diskStats = {
                totalSpace,
                availableSpace,
                percentFree,
            }
        } catch (error) {
            Logger.error('Failed to retrieve disk space statistics', error)
        }

        return {
            database: dbStats,
            attachments: {
                totalSize: rawAttachmentStats.totalSize,
                totalFiles: rawAttachmentStats.totalFiles,
                testDirectories: rawAttachmentStats.testDirectories,
                typeBreakdown,
            },
            total: {
                size: totalSize,
                averageSizePerTest,
            },
            disk: diskStats,
        }
    }

    private async getDatabaseStats(): Promise<StorageStats['database']> {
        // Get database file size from OUTPUT_DIR (where DatabaseManager stores it)
        const dbPath = path.join(config.storage.outputDir, 'test-results.db')
        let dbSize = 0

        try {
            const stats = fs.statSync(dbPath)
            dbSize = stats.size

            // Add WAL and SHM files if they exist
            try {
                const walStats = fs.statSync(`${dbPath}-wal`)
                dbSize += walStats.size
            } catch {
                // WAL file doesn't exist, skip
            }

            try {
                const shmStats = fs.statSync(`${dbPath}-shm`)
                dbSize += shmStats.size
            } catch {
                // SHM file doesn't exist, skip
            }
        } catch {
            // Silently handle missing database file - may not exist yet
            // This is normal if no tests have been run yet
        }

        // Get record counts
        const counts = await this.queryOne<{
            total_runs: number
            total_results: number
            total_attachments: number
        }>(`
            SELECT
                (SELECT COUNT(*) FROM test_runs) as total_runs,
                (SELECT COUNT(*) FROM test_results) as total_results,
                (SELECT COUNT(*) FROM attachments) as total_attachments
        `)

        return {
            size: dbSize,
            totalRuns: counts?.total_runs || 0,
            totalResults: counts?.total_results || 0,
            totalAttachments: counts?.total_attachments || 0,
        }
    }
}

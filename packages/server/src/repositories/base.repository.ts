import {DatabaseManager} from '../database/database.manager'

export abstract class BaseRepository {
    protected dbManager: DatabaseManager

    constructor(dbManager: DatabaseManager) {
        this.dbManager = dbManager
    }

    protected async execute(sql: string, params: any[] = []): Promise<void> {
        await this.dbManager.execute(sql, params)
    }

    protected async queryOne<T>(sql: string, params: any[] = []): Promise<T | null> {
        return this.dbManager.queryOne(sql, params)
    }

    protected async queryAll<T>(sql: string, params: any[] = []): Promise<T[]> {
        return this.dbManager.queryAll(sql, params)
    }
}

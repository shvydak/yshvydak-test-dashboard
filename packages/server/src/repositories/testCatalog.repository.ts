import {BaseRepository} from './base.repository'

export interface CatalogEntry {
    project: string
    testId: string
    name: string
    filePath: string
    metadata: unknown
    discoveredAt: string
}

// Read by TestRepository.getAllTests (CATALOG_COLUMNS) to decide `notInCode`.
export const CATALOG_LAST_FULL_SCAN_KEY = 'catalog_last_full_scan'

// 6 params per row, 150 rows per statement = 900 variables (under SQLite's 999 default).
const UPSERT_BATCH_ROWS = 150

export interface ITestCatalogRepository {
    upsertMany(entries: CatalogEntry[]): Promise<void>
    deleteStale(project: string, scanAt: string): Promise<number>
    deleteByTestId(testId: string): Promise<number>
    deleteByProject(project: string): Promise<number>
    markFullScan(scanAt: string): Promise<void>
}

// test_catalog = what the latest `--list` found per (project, test). Not execution history:
// UPSERT/DELETE are allowed here, and it never holds a status.
export class TestCatalogRepository extends BaseRepository implements ITestCatalogRepository {
    async upsertMany(entries: CatalogEntry[]): Promise<void> {
        for (let i = 0; i < entries.length; i += UPSERT_BATCH_ROWS) {
            const batch = entries.slice(i, i + UPSERT_BATCH_ROWS)
            const params: any[] = []
            for (const e of batch) {
                params.push(
                    e.project,
                    e.testId,
                    e.name,
                    e.filePath,
                    e.metadata ? JSON.stringify(e.metadata) : null,
                    e.discoveredAt
                )
            }
            await this.dbManager.execute(
                `INSERT INTO test_catalog (project, test_id, name, file_path, metadata, discovered_at)
                 VALUES ${batch.map(() => '(?, ?, ?, ?, ?, ?)').join(',')}
                 ON CONFLICT(project, test_id) DO UPDATE SET
                     name = excluded.name,
                     file_path = excluded.file_path,
                     metadata = excluded.metadata,
                     discovered_at = excluded.discovered_at`,
                params
            )
        }
    }

    // ISO-Z strings are fixed-width, so the string compare is a time compare.
    async deleteStale(project: string, scanAt: string): Promise<number> {
        const result = await this.dbManager.execute(
            `DELETE FROM test_catalog WHERE project = ? AND discovered_at < ?`,
            [project, scanAt]
        )
        return result.changes || 0
    }

    async deleteByTestId(testId: string): Promise<number> {
        const result = await this.dbManager.execute(`DELETE FROM test_catalog WHERE test_id = ?`, [
            testId,
        ])
        return result.changes || 0
    }

    // Time of the last scan that listed ALL projects (app_settings key, UPSERT like SettingsRepository).
    // "Not in code" is judged against it alone: a scoped scan cannot see a test that moved projects.
    async markFullScan(scanAt: string): Promise<void> {
        await this.dbManager.execute(
            `INSERT INTO app_settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
            [CATALOG_LAST_FULL_SCAN_KEY, scanAt]
        )
    }

    async deleteByProject(project: string): Promise<number> {
        const result = await this.dbManager.execute(`DELETE FROM test_catalog WHERE project = ?`, [
            project,
        ])
        return result.changes || 0
    }
}

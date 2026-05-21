import {BaseRepository} from './base.repository'

const GLOBAL_PLAYWRIGHT_PROJECT_KEY = 'global_playwright_project'
const DISK_WARNING_PERCENT_KEY = 'disk_warning_threshold_percent'
const DISK_CRITICAL_PERCENT_KEY = 'disk_critical_threshold_percent'

const DISK_WARNING_DEFAULT = 20
const DISK_CRITICAL_DEFAULT = 5

interface AppSettingRow {
    key: string
    value: string | null
}

export interface DiskThresholds {
    warningPercent: number
    criticalPercent: number
}

export interface ISettingsRepository {
    getGlobalPlaywrightProject(): Promise<string>
    setGlobalPlaywrightProject(project: string): Promise<void>
    getDiskThresholds(): Promise<DiskThresholds>
    setDiskThresholds(thresholds: DiskThresholds): Promise<void>
}

export class SettingsRepository extends BaseRepository implements ISettingsRepository {
    async getGlobalPlaywrightProject(): Promise<string> {
        const row = await this.queryOne<AppSettingRow>(
            'SELECT key, value FROM app_settings WHERE key = ?',
            [GLOBAL_PLAYWRIGHT_PROJECT_KEY]
        )

        return row?.value ?? ''
    }

    async setGlobalPlaywrightProject(project: string): Promise<void> {
        await this.execute(
            `
                INSERT INTO app_settings (key, value)
                VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP
            `,
            [GLOBAL_PLAYWRIGHT_PROJECT_KEY, project]
        )
    }

    async getDiskThresholds(): Promise<DiskThresholds> {
        const warningRow = await this.queryOne<AppSettingRow>(
            'SELECT key, value FROM app_settings WHERE key = ?',
            [DISK_WARNING_PERCENT_KEY]
        )
        const criticalRow = await this.queryOne<AppSettingRow>(
            'SELECT key, value FROM app_settings WHERE key = ?',
            [DISK_CRITICAL_PERCENT_KEY]
        )

        return {
            warningPercent:
                warningRow?.value != null ? parseInt(warningRow.value) : DISK_WARNING_DEFAULT,
            criticalPercent:
                criticalRow?.value != null ? parseInt(criticalRow.value) : DISK_CRITICAL_DEFAULT,
        }
    }

    async setDiskThresholds(thresholds: DiskThresholds): Promise<void> {
        const upsertSql = `
            INSERT INTO app_settings (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
        `
        await this.execute(upsertSql, [DISK_WARNING_PERCENT_KEY, String(thresholds.warningPercent)])
        await this.execute(upsertSql, [
            DISK_CRITICAL_PERCENT_KEY,
            String(thresholds.criticalPercent),
        ])
    }
}

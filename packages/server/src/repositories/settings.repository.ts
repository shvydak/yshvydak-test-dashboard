import {BaseRepository} from './base.repository'

const GLOBAL_PLAYWRIGHT_PROJECT_KEY = 'global_playwright_project'
const DISK_WARNING_PERCENT_KEY = 'disk_warning_threshold_percent'
const DISK_CRITICAL_PERCENT_KEY = 'disk_critical_threshold_percent'
const PROJECT_TAB_CONFIGS_KEY = 'project_tab_configs'
const CI_AUTORUN_PAUSED_KEY = 'ci_autorun_paused'
const CI_AUTORUN_RESUME_AT_KEY = 'ci_autorun_resume_at'

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

export interface ProjectTabConfig {
    project: string
    displayName: string
    visible: boolean
}

export interface CIAutoRunPause {
    paused: boolean
    resumeAt: string | null
}

export interface ISettingsRepository {
    getGlobalPlaywrightProject(): Promise<string>
    setGlobalPlaywrightProject(project: string): Promise<void>
    getDiskThresholds(): Promise<DiskThresholds>
    setDiskThresholds(thresholds: DiskThresholds): Promise<void>
    getProjectTabConfigs(): Promise<ProjectTabConfig[]>
    setProjectTabConfigs(configs: ProjectTabConfig[]): Promise<void>
    getCIAutoRunPause(): Promise<CIAutoRunPause>
    setCIAutoRunPause(pause: CIAutoRunPause): Promise<void>
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

    async getProjectTabConfigs(): Promise<ProjectTabConfig[]> {
        const row = await this.queryOne<AppSettingRow>(
            'SELECT key, value FROM app_settings WHERE key = ?',
            [PROJECT_TAB_CONFIGS_KEY]
        )

        if (!row?.value) return []

        try {
            return JSON.parse(row.value) as ProjectTabConfig[]
        } catch {
            return []
        }
    }

    async setProjectTabConfigs(configs: ProjectTabConfig[]): Promise<void> {
        await this.execute(
            `
                INSERT INTO app_settings (key, value)
                VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP
            `,
            [PROJECT_TAB_CONFIGS_KEY, JSON.stringify(configs)]
        )
    }

    async getCIAutoRunPause(): Promise<CIAutoRunPause> {
        const [pausedRow, resumeAtRow] = await Promise.all([
            this.queryOne<AppSettingRow>('SELECT key, value FROM app_settings WHERE key = ?', [
                CI_AUTORUN_PAUSED_KEY,
            ]),
            this.queryOne<AppSettingRow>('SELECT key, value FROM app_settings WHERE key = ?', [
                CI_AUTORUN_RESUME_AT_KEY,
            ]),
        ])

        return {
            paused: pausedRow?.value === 'true',
            resumeAt: resumeAtRow?.value ?? null,
        }
    }

    async setCIAutoRunPause(pause: CIAutoRunPause): Promise<void> {
        const upsertSql = `
            INSERT INTO app_settings (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
        `
        await this.execute(upsertSql, [CI_AUTORUN_PAUSED_KEY, pause.paused ? 'true' : 'false'])
        await this.execute(upsertSql, [CI_AUTORUN_RESUME_AT_KEY, pause.resumeAt ?? ''])
    }
}

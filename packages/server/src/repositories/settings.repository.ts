import {BaseRepository} from './base.repository'

const GLOBAL_PLAYWRIGHT_PROJECT_KEY = 'global_playwright_project'

interface AppSettingRow {
    key: string
    value: string | null
}

export interface ISettingsRepository {
    getGlobalPlaywrightProject(): Promise<string>
    setGlobalPlaywrightProject(project: string): Promise<void>
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
}

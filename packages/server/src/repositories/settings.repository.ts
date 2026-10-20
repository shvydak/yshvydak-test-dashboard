import {BaseRepository} from './base.repository'
import {CIPipelineName, normalizeCIPipelines} from '../utils/ciPipeline.util'
import {ChipAlignment, normalizeChipAlignment} from '../utils/chipAlignment.util'
import {TagMode, normalizeTagMode} from '../utils/tagMode.util'

const GLOBAL_PLAYWRIGHT_PROJECT_KEY = 'global_playwright_project'
const DISK_WARNING_PERCENT_KEY = 'disk_warning_threshold_percent'
const DISK_CRITICAL_PERCENT_KEY = 'disk_critical_threshold_percent'
const PROJECT_TAB_CONFIGS_KEY = 'project_tab_configs'
const DEFAULT_PROJECT_TAB_KEY = 'default_project_tab'
const CI_AUTORUN_PAUSED_KEY = 'ci_autorun_paused'
const CI_AUTORUN_RESUME_AT_KEY = 'ci_autorun_resume_at'
const JIRA_BASE_URL_KEY = 'jira_base_url'
const CHIP_ALIGNMENT_KEY = 'chip_alignment'
const CHIP_TAG_MODE_KEY = 'chip_tag_mode'
const CI_INFLIGHT_PIPELINE_KEY = 'ci_inflight_pipeline'
const INFLIGHT_RUN_KEY = 'inflight_run'

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
    pipelines: CIPipelineName[]
    stopPipelineOnFailure: boolean
    workers?: number
}

export interface CIAutoRunPause {
    paused: boolean
    resumeAt: string | null
}

export interface JiraSettings {
    baseUrl: string
    chipAlignment: ChipAlignment
    tagMode: TagMode
}

/** Written while a CI pipeline runs, cleared on finish; a marker found at startup = interrupted by a restart. */
export interface InFlightPipelineMarker {
    pipeline: CIPipelineName
    source: string | null
    notify: boolean
    startedAt: string
    runIds: string[]
    // Step project slugs — lets the restart message build the same link rules as a result message.
    projects: string[]
    // Process groups of the spawned steps; startup SIGKILLs the ones still alive.
    pgids: number[]
    // Last write (after the latest spawn): a process younger than this is not the marker's run.
    writtenAt?: string
}

/** Written while a manual (non-pipeline) run is alive, so a restart can clean up after it too. */
export interface InFlightRunMarker {
    runId: string
    pgid: number | null
    project: string | null
    // Run-all: discovery rows newer than this are removed with the run's results.
    pendingSince: string | null
    startedAt: string
}

export interface ISettingsRepository {
    getGlobalPlaywrightProject(): Promise<string>
    setGlobalPlaywrightProject(project: string): Promise<void>
    getDiskThresholds(): Promise<DiskThresholds>
    setDiskThresholds(thresholds: DiskThresholds): Promise<void>
    getProjectTabConfigs(): Promise<ProjectTabConfig[]>
    setProjectTabConfigs(configs: ProjectTabConfig[]): Promise<void>
    getDefaultProjectTab(): Promise<string>
    setDefaultProjectTab(project: string): Promise<void>
    getCIAutoRunPause(): Promise<CIAutoRunPause>
    setCIAutoRunPause(pause: CIAutoRunPause): Promise<void>
    getJiraSettings(): Promise<JiraSettings>
    setJiraSettings(settings: JiraSettings): Promise<void>
    getInFlightPipeline(): Promise<InFlightPipelineMarker | null>
    setInFlightPipeline(marker: InFlightPipelineMarker): Promise<void>
    clearInFlightPipeline(): Promise<void>
    getInFlightRun(): Promise<InFlightRunMarker | null>
    setInFlightRun(marker: InFlightRunMarker): Promise<void>
    clearInFlightRun(): Promise<void>
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
            const parsed = JSON.parse(row.value) as Array<
                Partial<ProjectTabConfig> & {inPipeline?: boolean}
            >
            // Legacy rows used inPipeline:true (one unnamed pipeline). Those become
            // pipelines:['develop'] so existing CI keeps running after this change.
            return parsed.map((c) => ({
                project: c.project ?? '',
                displayName: c.displayName ?? c.project ?? '',
                visible: c.visible ?? true,
                pipelines: normalizeCIPipelines(c.pipelines, c.inPipeline),
                stopPipelineOnFailure: c.stopPipelineOnFailure ?? false,
                workers: c.workers,
            }))
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

    async getDefaultProjectTab(): Promise<string> {
        const row = await this.queryOne<AppSettingRow>(
            'SELECT key, value FROM app_settings WHERE key = ?',
            [DEFAULT_PROJECT_TAB_KEY]
        )

        return row?.value ?? ''
    }

    async setDefaultProjectTab(project: string): Promise<void> {
        await this.execute(
            `
                INSERT INTO app_settings (key, value)
                VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP
            `,
            [DEFAULT_PROJECT_TAB_KEY, project]
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

    async getJiraSettings(): Promise<JiraSettings> {
        const readValue = async (key: string): Promise<string | null | undefined> =>
            (
                await this.queryOne<AppSettingRow>(
                    'SELECT key, value FROM app_settings WHERE key = ?',
                    [key]
                )
            )?.value

        const [baseUrl, chipAlignment, tagMode] = await Promise.all([
            readValue(JIRA_BASE_URL_KEY),
            readValue(CHIP_ALIGNMENT_KEY),
            readValue(CHIP_TAG_MODE_KEY),
        ])

        return {
            baseUrl: baseUrl ?? '',
            chipAlignment: normalizeChipAlignment(chipAlignment),
            tagMode: normalizeTagMode(tagMode),
        }
    }

    async setJiraSettings(settings: JiraSettings): Promise<void> {
        const upsertSql = `
            INSERT INTO app_settings (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
        `
        await this.execute(upsertSql, [JIRA_BASE_URL_KEY, settings.baseUrl])
        await this.execute(upsertSql, [CHIP_ALIGNMENT_KEY, settings.chipAlignment])
        await this.execute(upsertSql, [CHIP_TAG_MODE_KEY, settings.tagMode])
    }

    async getInFlightPipeline(): Promise<InFlightPipelineMarker | null> {
        const row = await this.queryOne<AppSettingRow>(
            'SELECT key, value FROM app_settings WHERE key = ?',
            [CI_INFLIGHT_PIPELINE_KEY]
        )
        if (!row?.value) return null

        try {
            const parsed = JSON.parse(row.value) as Partial<InFlightPipelineMarker>
            return {
                pipeline: parsed.pipeline ?? 'develop',
                source: parsed.source ?? null,
                notify: parsed.notify === true,
                startedAt: parsed.startedAt ?? '',
                runIds: Array.isArray(parsed.runIds) ? parsed.runIds : [],
                projects: Array.isArray(parsed.projects) ? parsed.projects : [],
                pgids: Array.isArray(parsed.pgids) ? parsed.pgids : [],
                ...(parsed.writtenAt ? {writtenAt: parsed.writtenAt} : {}),
            }
        } catch {
            return null
        }
    }

    async setInFlightPipeline(marker: InFlightPipelineMarker): Promise<void> {
        await this.execute(
            `
                INSERT INTO app_settings (key, value)
                VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP
            `,
            [CI_INFLIGHT_PIPELINE_KEY, JSON.stringify(marker)]
        )
    }

    async clearInFlightPipeline(): Promise<void> {
        await this.execute('DELETE FROM app_settings WHERE key = ?', [CI_INFLIGHT_PIPELINE_KEY])
    }

    async getInFlightRun(): Promise<InFlightRunMarker | null> {
        const row = await this.queryOne<AppSettingRow>(
            'SELECT key, value FROM app_settings WHERE key = ?',
            [INFLIGHT_RUN_KEY]
        )
        if (!row?.value) return null

        try {
            const parsed = JSON.parse(row.value) as Partial<InFlightRunMarker>
            if (!parsed.runId) return null
            return {
                runId: parsed.runId,
                pgid: typeof parsed.pgid === 'number' ? parsed.pgid : null,
                project: parsed.project ?? null,
                pendingSince: parsed.pendingSince ?? null,
                startedAt: parsed.startedAt ?? '',
            }
        } catch {
            return null
        }
    }

    async setInFlightRun(marker: InFlightRunMarker): Promise<void> {
        await this.execute(
            `
                INSERT INTO app_settings (key, value)
                VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP
            `,
            [INFLIGHT_RUN_KEY, JSON.stringify(marker)]
        )
    }

    async clearInFlightRun(): Promise<void> {
        await this.execute('DELETE FROM app_settings WHERE key = ?', [INFLIGHT_RUN_KEY])
    }
}

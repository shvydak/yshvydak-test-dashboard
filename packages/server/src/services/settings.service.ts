import {
    SettingsRepository,
    DiskThresholds,
    ProjectTabConfig,
    CIAutoRunPause,
} from '../repositories/settings.repository'
import {PlaywrightService} from './playwright.service'
import {Logger} from '../utils/logger.util'

export interface TestExecutionSettings {
    project: string
}

export type {DiskThresholds, ProjectTabConfig, CIAutoRunPause}

export class SettingsService {
    constructor(
        private settingsRepository: SettingsRepository,
        private playwrightService: PlaywrightService
    ) {}

    async getTestExecutionSettings(): Promise<TestExecutionSettings> {
        const project = await this.getGlobalPlaywrightProject()

        return {project}
    }

    async getGlobalPlaywrightProject(): Promise<string> {
        const project = (await this.settingsRepository.getGlobalPlaywrightProject()).trim()

        if (!project) {
            return ''
        }

        const availableProjects = await this.playwrightService.getAvailableProjects()
        if (availableProjects.includes(project)) {
            return project
        }

        Logger.warn(`Saved Playwright project "${project}" no longer exists, resetting to all`)
        await this.settingsRepository.setGlobalPlaywrightProject('')

        return ''
    }

    async getDiskThresholds(): Promise<DiskThresholds> {
        return this.settingsRepository.getDiskThresholds()
    }

    async setDiskThresholds(
        warningPercent: number,
        criticalPercent: number
    ): Promise<DiskThresholds> {
        if (criticalPercent >= warningPercent) {
            throw new Error('Critical threshold must be lower than warning threshold')
        }
        const thresholds = {warningPercent, criticalPercent}
        await this.settingsRepository.setDiskThresholds(thresholds)
        Logger.info(
            `Disk thresholds updated: warning=${warningPercent}%, critical=${criticalPercent}%`
        )
        return thresholds
    }

    async getProjectTabConfigs(): Promise<ProjectTabConfig[]> {
        return this.settingsRepository.getProjectTabConfigs()
    }

    async setProjectTabConfigs(configs: ProjectTabConfig[]): Promise<ProjectTabConfig[]> {
        const validated = configs.map((c) => ({
            project: String(c.project || '').trim(),
            displayName: String(c.displayName || c.project || '').trim(),
            visible: Boolean(c.visible),
            inPipeline: Boolean(c.inPipeline),
            stopPipelineOnFailure: Boolean(c.stopPipelineOnFailure),
        }))
        await this.settingsRepository.setProjectTabConfigs(validated)
        Logger.info(`Project tab configs updated: ${validated.length} entries`)
        return validated
    }

    /**
     * Ordered list of tabs configured to run in the CI pipeline, in the same
     * order as they appear in project_tab_configs (pipeline order = tab order).
     */
    async getPipelineSteps(): Promise<ProjectTabConfig[]> {
        const tabs = await this.getProjectTabConfigs()
        return tabs.filter((t) => t.inPipeline)
    }

    async getCIAutoRunPause(): Promise<CIAutoRunPause> {
        return this.settingsRepository.getCIAutoRunPause()
    }

    async setCIAutoRunPause(paused: boolean, durationHours?: number): Promise<CIAutoRunPause> {
        let resumeAt: string | null = null

        if (paused && durationHours && durationHours > 0) {
            const resume = new Date()
            resume.setHours(resume.getHours() + durationHours)
            resumeAt = resume.toISOString()
        }

        const pause: CIAutoRunPause = {paused, resumeAt}
        await this.settingsRepository.setCIAutoRunPause(pause)
        Logger.info(
            paused
                ? `CI auto-run paused${resumeAt ? ` until ${resumeAt}` : ' indefinitely'}`
                : 'CI auto-run resumed'
        )
        return pause
    }

    async setGlobalPlaywrightProject(project: string): Promise<TestExecutionSettings> {
        const normalizedProject = project.trim()

        if (!normalizedProject) {
            await this.settingsRepository.setGlobalPlaywrightProject('')
            Logger.info('Global Playwright project reset to all projects')

            return {project: ''}
        }

        const availableProjects = await this.playwrightService.getAvailableProjects()
        if (!availableProjects.includes(normalizedProject)) {
            throw new Error(`Unknown Playwright project: ${normalizedProject}`)
        }

        await this.settingsRepository.setGlobalPlaywrightProject(normalizedProject)
        Logger.info(`Global Playwright project updated to "${normalizedProject}"`)

        return {project: normalizedProject}
    }
}

import {SettingsRepository, DiskThresholds} from '../repositories/settings.repository'
import {PlaywrightService} from './playwright.service'
import {Logger} from '../utils/logger.util'

export interface TestExecutionSettings {
    project: string
}

export type {DiskThresholds}

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

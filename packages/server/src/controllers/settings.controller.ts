import {Response} from 'express'
import {SettingsService} from '../services/settings.service'
import {ResponseHelper} from '../utils/response.helper'
import {Logger} from '../utils/logger.util'
import {ServiceRequest} from '../types/api.types'

export class SettingsController {
    constructor(private settingsService: SettingsService) {}

    getTestExecutionSettings = async (_req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const settings = await this.settingsService.getTestExecutionSettings()
            return ResponseHelper.success(res, settings)
        } catch (error) {
            Logger.error('Error getting test execution settings', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to get test execution settings',
                500
            )
        }
    }

    updateGlobalPlaywrightProject = async (
        req: ServiceRequest,
        res: Response
    ): Promise<Response> => {
        try {
            const {project} = req.body

            if (typeof project !== 'string') {
                return ResponseHelper.badRequest(res, 'Project must be a string')
            }

            const settings = await this.settingsService.setGlobalPlaywrightProject(project)
            return ResponseHelper.success(res, settings)
        } catch (error) {
            Logger.error('Error updating global Playwright project', error)

            if (error instanceof Error && error.message.startsWith('Unknown Playwright project:')) {
                return ResponseHelper.badRequest(res, error.message)
            }

            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to update global Playwright project',
                500
            )
        }
    }
}

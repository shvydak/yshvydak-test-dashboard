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

    getDiskThresholds = async (_req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const thresholds = await this.settingsService.getDiskThresholds()
            return ResponseHelper.success(res, thresholds)
        } catch (error) {
            Logger.error('Error getting disk thresholds', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to get disk thresholds',
                500
            )
        }
    }

    updateDiskThresholds = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const {warningPercent, criticalPercent} = req.body

            if (typeof warningPercent !== 'number' || typeof criticalPercent !== 'number') {
                return ResponseHelper.badRequest(
                    res,
                    'warningPercent and criticalPercent must be numbers'
                )
            }
            if (warningPercent < 1 || warningPercent > 99) {
                return ResponseHelper.badRequest(res, 'warningPercent must be between 1 and 99')
            }
            if (criticalPercent < 1 || criticalPercent > 99) {
                return ResponseHelper.badRequest(res, 'criticalPercent must be between 1 and 99')
            }

            const thresholds = await this.settingsService.setDiskThresholds(
                warningPercent,
                criticalPercent
            )
            return ResponseHelper.success(res, thresholds)
        } catch (error) {
            Logger.error('Error updating disk thresholds', error)

            if (
                error instanceof Error &&
                error.message === 'Critical threshold must be lower than warning threshold'
            ) {
                return ResponseHelper.badRequest(res, error.message)
            }

            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to update disk thresholds',
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

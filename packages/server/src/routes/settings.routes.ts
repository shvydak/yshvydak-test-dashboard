import {Router} from 'express'
import {SettingsController} from '../controllers/settings.controller'
import {ServiceContainer} from '../middleware/service-injection.middleware'
import {createAuthMiddleware, requireJWT} from '../middleware/auth.middleware'

export function createSettingsRoutes(container: ServiceContainer): Router {
    const router = Router()
    const settingsController = new SettingsController(container.settingsService)
    const authMiddleware = createAuthMiddleware(container.authService)

    router.use(authMiddleware, requireJWT())

    router.get('/test-execution', settingsController.getTestExecutionSettings)
    router.put('/test-execution/project', settingsController.updateGlobalPlaywrightProject)
    router.get('/disk-thresholds', settingsController.getDiskThresholds)
    router.put('/disk-thresholds', settingsController.updateDiskThresholds)
    router.get('/project-tabs', settingsController.getProjectTabConfigs)
    router.put('/project-tabs', settingsController.updateProjectTabConfigs)
    router.get('/ci-autorun-pause', settingsController.getCIAutoRunPause)
    router.put('/ci-autorun-pause', settingsController.updateCIAutoRunPause)

    return router
}

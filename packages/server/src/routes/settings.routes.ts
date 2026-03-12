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

    return router
}

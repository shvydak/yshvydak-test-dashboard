import {Router} from 'express'
import {HealthController} from '../controllers/health.controller'
import {ServiceContainer} from '../middleware/service-injection.middleware'
import {createTestRoutes} from './test.routes'
import {createRunRoutes} from './run.routes'
import {createAuthRoutes} from './auth.routes'
import {createStorageRoutes} from './storage.routes'
import {createSettingsRoutes} from './settings.routes'
import {createPipelineRoutes} from './pipeline.routes'
import {createJiraRoutes} from './jira.routes'
import {createApiAuthMiddleware, createAuthMiddleware} from '../middleware/auth.middleware'

export function createApiRoutes(container: ServiceContainer): Router {
    const router = Router()
    const healthController = new HealthController()

    // Public endpoints (no authentication required)
    router.get('/health', healthController.healthCheck)
    router.use('/auth', createAuthRoutes())

    // JWT required when ENABLE_AUTH=true. The 5 reporter routes skip it only on the internal listener.
    router.use(
        '/tests',
        createApiAuthMiddleware(container.authService),
        createTestRoutes(container)
    )
    router.use('/runs', createApiAuthMiddleware(container.authService), createRunRoutes(container))
    router.use(
        '/storage',
        createAuthMiddleware(container.authService),
        createStorageRoutes(container)
    )
    router.use('/settings', createSettingsRoutes(container))
    router.use('/pipeline', createPipelineRoutes(container))
    router.use('/jira', createJiraRoutes(container))
    // Note: Attachments are handled via /tests/:id/attachments endpoint

    return router
}

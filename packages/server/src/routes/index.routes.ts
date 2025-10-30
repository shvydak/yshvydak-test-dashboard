import {Router} from 'express'
import {HealthController} from '../controllers/health.controller'
import {ServiceContainer} from '../middleware/service-injection.middleware'
import {createTestRoutes} from './test.routes'
import {createRunRoutes} from './run.routes'
import {createAuthRoutes} from './auth.routes'
import {createStorageRoutes} from './storage.routes'

export function createApiRoutes(container: ServiceContainer): Router {
    const router = Router()
    const healthController = new HealthController()

    // Public endpoints (no authentication required)
    router.get('/health', healthController.healthCheck)
    router.use('/auth', createAuthRoutes())

    // Public API routes for reporter integration (no authentication)
    router.use('/tests', createTestRoutes(container))
    router.use('/runs', createRunRoutes(container))
    router.use('/storage', createStorageRoutes(container))
    // Note: Attachments are handled via /tests/:id/attachments endpoint

    return router
}

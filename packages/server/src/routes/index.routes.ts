import { Router } from 'express'
import { HealthController } from '../controllers/health.controller'
import { ServiceContainer } from '../middleware/service-injection.middleware'
import { createAuthMiddleware } from '../middleware/auth.middleware'
import { createTestRoutes } from './test.routes'
import { createRunRoutes } from './run.routes'
import { createAuthRoutes } from './auth.routes'

export function createApiRoutes(container: ServiceContainer): Router {
    const router = Router()
    const healthController = new HealthController()

    // Create authentication middleware
    const authMiddleware = createAuthMiddleware(container.authService)

    // Public endpoints (no authentication required)
    router.get('/health', healthController.healthCheck)
    router.use('/auth', createAuthRoutes())

    // Apply authentication middleware to all routes below this point
    router.use(authMiddleware)

    // Protected API routes with service injection
    router.use('/tests', createTestRoutes(container))
    router.use('/runs', createRunRoutes(container))
    // Note: Attachments are handled via /tests/:id/attachments endpoint

    return router
}
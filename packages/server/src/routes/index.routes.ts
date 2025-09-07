import { Router } from 'express'
import { HealthController } from '../controllers/health.controller'
import { ServiceContainer } from '../middleware/service-injection.middleware'
import { createTestRoutes } from './test.routes'
import { createRunRoutes } from './run.routes'
import { createAttachmentRoutes } from './attachment.routes'

export function createApiRoutes(container: ServiceContainer): Router {
    const router = Router()
    const healthController = new HealthController()

    // Health check
    router.get('/health', healthController.healthCheck)

    // API routes with service injection
    router.use('/tests', createTestRoutes(container))
    router.use('/runs', createRunRoutes(container))
    router.use('/attachments', createAttachmentRoutes(container))

    return router
}
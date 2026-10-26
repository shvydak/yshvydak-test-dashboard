import {Router} from 'express'
import {PipelineController} from '../controllers/pipeline.controller'
import {ServiceContainer} from '../middleware/service-injection.middleware'
import {createAuthMiddleware, requireJWT} from '../middleware/auth.middleware'

export function createPipelineRoutes(container: ServiceContainer): Router {
    const router = Router()
    const pipelineController = new PipelineController(container.pipelineExecutionService)
    const authMiddleware = createAuthMiddleware(container.authService)

    // Can stop a running CI run (replace): JWT when ENABLE_AUTH is on, open when off (local use, scripts)
    router.post('/run', authMiddleware, pipelineController.runPipeline)
    // Destructive: signed-in users only, like /settings/* (403 when ENABLE_AUTH is off)
    router.post('/stop', authMiddleware, requireJWT(), pipelineController.stopPipeline)
    // Specific route must come before the parameterized one below
    router.get('/status/current', authMiddleware, pipelineController.getCurrentPipelineStatus)
    router.get('/status/:pipelineRunId', authMiddleware, pipelineController.getPipelineStatus)

    return router
}

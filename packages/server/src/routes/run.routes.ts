import {Router} from 'express'
import {RunController} from '../controllers/run.controller'
import {requireSafeIdParams} from '../middleware/idParams.middleware'
import {requireJWT} from '../middleware/auth.middleware'
import {ServiceContainer} from '../middleware/service-injection.middleware'

export function createRunRoutes(container: ServiceContainer): Router {
    const router = Router()
    requireSafeIdParams(router, ['id'])
    const runController = new RunController(
        container.runRepository,
        container.testService,
        container.pipelineExecutionService
    )

    router.post('/', runController.createTestRun)
    router.get('/', runController.getAllTestRuns)
    router.put('/:id', runController.updateTestRun)
    // Destructive: signed-in users only (403 when ENABLE_AUTH is off), like POST /pipeline/stop
    router.post('/:id/stop', requireJWT(), runController.stopRun)

    // IMPORTANT: /stats route must come before /:id route to avoid conflicts
    router.get('/stats', runController.getStats)
    router.get('/:id', runController.getTestRun)

    return router
}

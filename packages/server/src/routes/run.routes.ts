import {Router} from 'express'
import {RunController} from '../controllers/run.controller'
import {ServiceContainer} from '../middleware/service-injection.middleware'

export function createRunRoutes(container: ServiceContainer): Router {
    const router = Router()
    const runController = new RunController(container.runRepository)

    router.post('/', runController.createTestRun)
    router.get('/', runController.getAllTestRuns)
    router.put('/:id', runController.updateTestRun)

    // IMPORTANT: /stats route must come before /:id route to avoid conflicts
    router.get('/stats', runController.getStats)
    router.get('/:id', runController.getTestRun)

    return router
}

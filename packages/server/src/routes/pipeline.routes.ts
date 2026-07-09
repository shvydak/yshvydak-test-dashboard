import {Router} from 'express'
import {PipelineController} from '../controllers/pipeline.controller'
import {ServiceContainer} from '../middleware/service-injection.middleware'

export function createPipelineRoutes(container: ServiceContainer): Router {
    const router = Router()
    const pipelineController = new PipelineController(container.pipelineExecutionService)

    router.post('/run', pipelineController.runPipeline)
    // Specific route must come before the parameterized one below
    router.get('/status/current', pipelineController.getCurrentPipelineStatus)
    router.get('/status/:pipelineRunId', pipelineController.getPipelineStatus)

    return router
}

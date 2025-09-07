import { Router } from 'express'
import { TestController } from '../controllers/test.controller'
import { ServiceContainer } from '../middleware/service-injection.middleware'

export function createTestRoutes(container: ServiceContainer): Router {
    const router = Router()
    const testController = new TestController(container.testService)

    // Test management endpoints
    router.post('/discovery', testController.discoverTests)
    router.post('/test-save', testController.testSave)
    router.post('/run-all', testController.runAllTests)
    router.post('/run-group', testController.runTestGroup)

    // Process notification endpoints
    router.post('/process-start', testController.processStart)
    router.post('/process-end', testController.processEnd)
    router.post('/force-reset', testController.forceReset)

    // CRUD endpoints
    router.get('/', testController.getAllTests)
    router.get('/stats', testController.getTestStats)
    router.get('/diagnostics', testController.getDiagnostics)
    router.delete('/all', testController.clearAllTests)
    router.post('/', testController.createTestResult)
    router.get('/:id', testController.getTestById)
    router.post('/:id/rerun', testController.rerunTest)
    router.get('/:id/history', testController.getTestHistory)
    router.get('/:id/attachments', testController.getTestAttachments)

    return router
}
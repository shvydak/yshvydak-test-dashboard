import {Router} from 'express'
import {TestController} from '../controllers/test.controller'
import {ServiceContainer} from '../middleware/service-injection.middleware'

export function createTestRoutes(container: ServiceContainer): Router {
    const router = Router()
    const testController = new TestController(container.testService, container.authService)

    // Test management endpoints
    router.post('/discovery', testController.discoverTests)
    router.post('/run-all', testController.runAllTests)
    router.post('/run-group', testController.runTestGroup)

    // Process notification endpoints
    router.post('/process-start', testController.processStart)
    router.post('/test-start', testController.testStart)
    router.post('/process-end', testController.processEnd)
    router.post('/force-reset', testController.forceReset)

    // CRUD endpoints
    router.get('/', testController.getAllTests)
    router.get('/stats', testController.getTestStats)
    router.get('/flaky', testController.getFlakyTests)
    router.get('/timeline', testController.getTestTimeline)
    router.get('/diagnostics', testController.getDiagnostics)
    router.delete('/all', testController.clearAllTests)
    router.post('/', testController.createTestResult)
    router.get('/:id', testController.getTestById)
    router.post('/:id/rerun', testController.rerunTest)
    router.get('/:id/history', testController.getTestHistory)
    router.get('/:id/attachments', testController.getTestAttachments)

    // Trace file endpoint (no auth middleware - JWT validation in controller)
    router.get('/traces/:attachmentId', testController.getTraceFile)

    return router
}

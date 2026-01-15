import {Router} from 'express'
import {TestController} from '../controllers/test.controller'
import {NoteController} from '../controllers/note.controller'
import {NoteImageController} from '../controllers/noteImage.controller'
import {uploadSingleImage} from '../middleware/upload.middleware'
import {ServiceContainer} from '../middleware/service-injection.middleware'

export function createTestRoutes(container: ServiceContainer): Router {
    const router = Router()
    const testController = new TestController(container.testService, container.authService)
    const noteController = new NoteController(container.noteService)
    const noteImageController = new NoteImageController(container.noteImageService)

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
    // Note: Specific routes must come before parameterized routes to avoid conflicts
    router.get('/', testController.getAllTests)
    router.get('/stats', testController.getTestStats)
    router.get('/flaky', testController.getFlakyTests)
    router.get('/timeline', testController.getTestTimeline)
    router.get('/diagnostics', testController.getDiagnostics)
    router.delete('/all', testController.clearAllTests)
    router.post('/cleanup', testController.cleanupData)
    router.post('/', testController.createTestResult)
    // Nested route must come before single-param route
    router.delete('/:testId/executions/:executionId', testController.deleteExecution)
    router.get('/:id', testController.getTestById)
    router.delete('/:testId', testController.deleteTest)
    router.post('/:id/rerun', testController.rerunTest)
    router.get('/:id/history', testController.getTestHistory)
    router.get('/:id/attachments', testController.getTestAttachments)

    // Note endpoints
    router.get('/:testId/notes', noteController.getNote)
    router.post('/:testId/notes', noteController.saveNote)
    router.delete('/:testId/notes', noteController.deleteNote)

    // Note image endpoints
    router.post('/:testId/notes/images', uploadSingleImage, noteImageController.uploadImage)
    router.get('/:testId/notes/images', noteImageController.getImages)
    router.delete('/:testId/notes/images/:imageId', noteImageController.deleteImage)

    // Trace file endpoint (no auth middleware - JWT validation in controller)
    router.get('/traces/:attachmentId', testController.getTraceFile)

    return router
}

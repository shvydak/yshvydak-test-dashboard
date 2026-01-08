import {Router} from 'express'
import multer from 'multer'
import {TestController} from '../controllers/test.controller'
import {NoteController} from '../controllers/note.controller'
import {ServiceContainer} from '../middleware/service-injection.middleware'

export function createTestRoutes(container: ServiceContainer): Router {
    const router = Router()
    const testController = new TestController(container.testService, container.authService)
    const noteController = new NoteController(container.noteService)

    // Multer configuration for image uploads (memory storage)
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: 5 * 1024 * 1024, // 5MB max file size
            files: 10, // Max 10 files per request
        },
        fileFilter: (_req, file, cb) => {
            const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']
            if (allowedTypes.includes(file.mimetype)) {
                cb(null, true)
            } else {
                cb(new Error('Invalid file type. Only PNG, JPG, JPEG, GIF, and WEBP are allowed.'))
            }
        },
    })

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
    router.post('/:testId/notes/images', upload.array('images', 10), noteController.uploadImages)
    router.get('/:testId/notes/images', noteController.getImages)
    router.delete('/:testId/notes/images/:imageId', noteController.deleteImage)

    // Trace file endpoint (no auth middleware - JWT validation in controller)
    router.get('/traces/:attachmentId', testController.getTraceFile)

    return router
}

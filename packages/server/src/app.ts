import express from 'express'
import path from 'path'
import {config} from './config/environment.config'
import {corsMiddleware} from './middleware/cors.middleware'
import {errorHandler, notFoundHandler} from './middleware/error.middleware'
import {createServiceContainer, injectServices} from './middleware/service-injection.middleware'
import {createAuthMiddleware} from './middleware/auth.middleware'
import {createApiRoutes} from './routes/index.routes'

// Uploads never render on the API origin: nosniff + sandbox, inline only for passive types
const INLINE_EXT = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.bmp',
    '.webm',
    '.mp4',
    '.txt',
    '.log',
    '.md',
    '.json',
    '.csv',
    '.zip',
])
const uploadStaticOptions: Parameters<typeof express.static>[1] = {
    setHeaders: (res, filePath) => {
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Content-Security-Policy', 'sandbox')
        if (!INLINE_EXT.has(path.extname(filePath).toLowerCase())) {
            res.setHeader('Content-Disposition', 'attachment')
        }
    },
}

export async function createApp() {
    const app = express()

    // Create service container (wait for database initialization)
    const serviceContainer = await createServiceContainer()

    // Basic middleware
    app.use(corsMiddleware)
    app.use(express.json({limit: config.api.requestLimit}))
    app.use(express.urlencoded({extended: true, limit: config.api.requestLimit}))

    // Service injection middleware
    app.use(injectServices(serviceContainer))

    // API routes
    app.use('/api', createApiRoutes(serviceContainer))

    // Protected static files (test reports, attachments) - require JWT authentication
    const authMiddleware = createAuthMiddleware(serviceContainer.authService)
    app.use(
        '/reports',
        authMiddleware,
        express.static(path.join(config.storage.outputDir, 'reports'))
    )
    app.use(
        '/attachments',
        authMiddleware,
        express.static(path.join(config.storage.outputDir, 'attachments'), uploadStaticOptions)
    )
    app.use(
        '/note-images',
        authMiddleware,
        express.static(path.join(config.storage.outputDir, 'note-images'), uploadStaticOptions)
    )

    // Serve test-results from the configured Playwright project directory - also protected
    app.use(
        '/test-results',
        authMiddleware,
        express.static(path.join(config.playwright.projectDir, 'test-results'))
    )

    // Error handling
    app.use('*', notFoundHandler)
    app.use(errorHandler)

    return {app, serviceContainer}
}

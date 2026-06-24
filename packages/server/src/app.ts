import express from 'express'
import path from 'path'
import {config} from './config/environment.config'
import {corsMiddleware} from './middleware/cors.middleware'
import {errorHandler, notFoundHandler} from './middleware/error.middleware'
import {createServiceContainer, injectServices} from './middleware/service-injection.middleware'
import {createAuthMiddleware} from './middleware/auth.middleware'
import {createApiRoutes} from './routes/index.routes'
import {Logger} from './utils/logger.util'

export async function createApp() {
    const app = express()

    // Create service container (wait for database initialization)
    const serviceContainer = await createServiceContainer()

    // Basic middleware
    app.use(corsMiddleware)
    app.use(express.json({limit: config.api.requestLimit}))
    app.use(express.urlencoded({extended: true, limit: config.api.requestLimit}))

    // Temporary diagnostic: log all POST requests to /api/tests
    app.use((req, _res, next) => {
        if (req.method === 'POST' && req.path.startsWith('/api/tests')) {
            Logger.debug(
                `[DIAG] POST ${req.path} received, body keys: ${Object.keys(req.body || {}).join(', ')}`
            )
        }
        next()
    })

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
        express.static(path.join(config.storage.outputDir, 'attachments'))
    )
    app.use(
        '/note-images',
        authMiddleware,
        express.static(path.join(config.storage.outputDir, 'note-images'))
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

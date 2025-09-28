import express from 'express'
import path from 'path'
import { config } from './config/environment.config'
import { corsMiddleware } from './middleware/cors.middleware'
import { errorHandler, notFoundHandler } from './middleware/error.middleware'
import { createServiceContainer, injectServices } from './middleware/service-injection.middleware'
import { createAuthMiddleware } from './middleware/auth.middleware'
import { createApiRoutes } from './routes/index.routes'

export function createApp() {
    const app = express()

    // Create service container
    const serviceContainer = createServiceContainer()

    // Basic middleware
    app.use(corsMiddleware)
    app.use(express.json({ limit: config.api.requestLimit }))
    app.use(express.urlencoded({ extended: true, limit: config.api.requestLimit }))

    // Service injection middleware
    app.use(injectServices(serviceContainer))

    // API routes
    app.use('/api', createApiRoutes(serviceContainer))

    // Protected static files (test reports, attachments) - require JWT authentication
    const authMiddleware = createAuthMiddleware(serviceContainer.authService)
    app.use('/reports', authMiddleware, express.static(path.join(config.storage.outputDir, 'reports')))
    app.use('/attachments', authMiddleware, express.static(path.join(config.storage.outputDir, 'attachments')))

    // Serve test-results from the configured Playwright project directory - also protected
    app.use(
        '/test-results',
        authMiddleware,
        express.static(path.join(config.playwright.projectDir, 'test-results'))
    )

    // Error handling
    app.use('*', notFoundHandler)
    app.use(errorHandler)

    return { app, serviceContainer }
}
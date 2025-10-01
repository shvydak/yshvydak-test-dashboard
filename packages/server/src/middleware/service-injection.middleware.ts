import {Request, Response, NextFunction} from 'express'
import {DatabaseManager} from '../database/database.manager'
import {TestRepository} from '../repositories/test.repository'
import {RunRepository} from '../repositories/run.repository'
import {AttachmentRepository} from '../repositories/attachment.repository'
import {TestService} from '../services/test.service'
import {PlaywrightService} from '../services/playwright.service'
import {WebSocketService} from '../services/websocket.service'
import {AttachmentService} from '../services/attachment.service'
import {AuthService} from '../services/auth.service'
import {config} from '../config/environment.config'

// Dependency container
export interface ServiceContainer {
    // Core services and repositories for Layered Architecture
    testRepository: TestRepository
    runRepository: RunRepository
    attachmentRepository: AttachmentRepository
    testService: TestService
    playwrightService: PlaywrightService
    websocketService: WebSocketService
    attachmentService: AttachmentService
    authService: AuthService
}

// Create service container
export function createServiceContainer(): ServiceContainer {
    // Initialize core services
    const dbManager = new DatabaseManager(config.storage.outputDir)

    // Initialize repositories
    const testRepository = new TestRepository(dbManager)
    const runRepository = new RunRepository(dbManager)
    const attachmentRepository = new AttachmentRepository(dbManager)

    // Initialize services
    const websocketService = new WebSocketService()
    const playwrightService = new PlaywrightService()
    const attachmentService = new AttachmentService(attachmentRepository)
    const authService = new AuthService()
    const testService = new TestService(
        testRepository,
        runRepository,
        playwrightService,
        websocketService,
        attachmentService
    )

    return {
        testRepository,
        runRepository,
        attachmentRepository,
        testService,
        playwrightService,
        websocketService,
        attachmentService,
        authService,
    }
}

// Middleware to inject services into request
export function injectServices(container: ServiceContainer) {
    return (req: Request, res: Response, next: NextFunction) => {
        // Service injection for Layered Architecture
        req.services = {
            testService: container.testService,
            playwrightService: container.playwrightService,
            websocketService: container.websocketService,
            attachmentService: container.attachmentService,
        }

        next()
    }
}

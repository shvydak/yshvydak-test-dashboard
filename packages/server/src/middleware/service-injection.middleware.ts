import {Request, Response, NextFunction} from 'express'
import {DatabaseManager} from '../database/database.manager'
import {TestRepository} from '../repositories/test.repository'
import {RunRepository} from '../repositories/run.repository'
import {AttachmentRepository} from '../repositories/attachment.repository'
import {StorageRepository} from '../repositories/storage.repository'
import {TestService} from '../services/test.service'
import {PlaywrightService} from '../services/playwright.service'
import {WebSocketService} from '../services/websocket.service'
import {AttachmentService} from '../services/attachment.service'
import {StorageService} from '../services/storage.service'
import {AuthService} from '../services/auth.service'
import {AttachmentManager} from '../storage/attachmentManager'
import {config} from '../config/environment.config'

// Dependency container
export interface ServiceContainer {
    // Core services and repositories for Layered Architecture
    testRepository: TestRepository
    runRepository: RunRepository
    attachmentRepository: AttachmentRepository
    storageRepository: StorageRepository
    testService: TestService
    playwrightService: PlaywrightService
    websocketService: WebSocketService
    attachmentService: AttachmentService
    storageService: StorageService
    authService: AuthService
}

// Create service container
export async function createServiceContainer(): Promise<ServiceContainer> {
    // Initialize core services
    const dbManager = new DatabaseManager(config.storage.outputDir)
    const attachmentManager = new AttachmentManager(config.storage.outputDir)

    // Wait for database initialization to complete
    await dbManager.initialize()

    // Initialize repositories
    const testRepository = new TestRepository(dbManager)
    const runRepository = new RunRepository(dbManager)
    const attachmentRepository = new AttachmentRepository(dbManager)
    const storageRepository = new StorageRepository(dbManager, attachmentManager)

    // Initialize services
    const websocketService = new WebSocketService()
    const playwrightService = new PlaywrightService()
    const attachmentService = new AttachmentService(attachmentRepository)
    const storageService = new StorageService(storageRepository)
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
        storageRepository,
        testService,
        playwrightService,
        websocketService,
        attachmentService,
        storageService,
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

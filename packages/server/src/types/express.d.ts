import { DatabaseManager } from '../database/database.manager'
import { TestService } from '../services/test.service'
import { PlaywrightService } from '../services/playwright.service'
import { WebSocketService } from '../services/websocket.service'
import { AttachmentService } from '../services/attachment.service'
import { EnvironmentConfig } from '../config/environment.config'

declare global {
    namespace Express {
        interface Request {
            // Legacy support for existing code during migration - guaranteed to be available
            dbManager: DatabaseManager
            attachmentManager: any
            config: EnvironmentConfig
            
            // New service injection
            services?: {
                testService?: TestService
                playwrightService?: PlaywrightService
                websocketService?: WebSocketService
                attachmentService?: AttachmentService
            }
        }
    }
}

import { TestService } from '../services/test.service'
import { PlaywrightService } from '../services/playwright.service'
import { WebSocketService } from '../services/websocket.service'
import { AttachmentService } from '../services/attachment.service'

declare global {
    namespace Express {
        interface Request {
            // Service injection for Layered Architecture
            services?: {
                testService?: TestService
                playwrightService?: PlaywrightService
                websocketService?: WebSocketService
                attachmentService?: AttachmentService
            }
        }
    }
}

import { Router } from 'express'
import { ServiceContainer } from '../middleware/service-injection.middleware'

export function createAttachmentRoutes(container: ServiceContainer): Router {
    const router = Router()

    // Import existing attachment routes from api/attachments.ts
    // For now, we'll use the existing router as-is to maintain compatibility
    const existingAttachmentsRouter = require('../api/attachments').default
    
    return existingAttachmentsRouter
}
import { Router } from 'express'
import { ServiceContainer } from '../middleware/service-injection.middleware'

export function createAttachmentRoutes(container: ServiceContainer): Router {
    const router = Router()

    // TODO: Implement AttachmentController here
    // For now, return empty router since attachments are handled via /tests/:id/attachments
    
    return router
}
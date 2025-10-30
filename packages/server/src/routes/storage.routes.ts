import {Router} from 'express'
import {StorageController} from '../controllers/storage.controller'
import {ServiceContainer} from '../middleware/service-injection.middleware'

export function createStorageRoutes(container: ServiceContainer): Router {
    const router = Router()
    const storageController = new StorageController(container.storageService)

    // Storage statistics endpoint
    router.get('/stats', storageController.getStorageStats)

    return router
}

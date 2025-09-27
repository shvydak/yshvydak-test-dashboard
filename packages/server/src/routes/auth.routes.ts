import { Router } from 'express'
import { AuthController } from '../controllers/auth.controller'
import { AuthService } from '../services/auth.service'

export function createAuthRoutes(): Router {
    const router = Router()
    const authService = new AuthService()
    const authController = new AuthController(authService)

    // Authentication endpoints
    router.post('/login', authController.login)
    router.post('/logout', authController.logout)
    router.get('/verify', authController.verify)
    router.get('/me', authController.me)
    router.get('/config', authController.config)

    return router
}
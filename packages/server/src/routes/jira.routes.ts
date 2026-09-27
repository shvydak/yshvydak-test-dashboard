import {Router} from 'express'
import {JiraController} from '../controllers/jira.controller'
import {ServiceContainer} from '../middleware/service-injection.middleware'
import {createAuthMiddleware, requireJWT} from '../middleware/auth.middleware'

export function createJiraRoutes(container: ServiceContainer): Router {
    const router = Router()
    const jiraController = new JiraController(container.jiraService)
    const authMiddleware = createAuthMiddleware(container.authService)

    router.use(authMiddleware, requireJWT())

    router.get('/status', jiraController.getStatus)
    router.get('/tickets', jiraController.getTickets)
    router.post('/refresh', jiraController.refresh)

    return router
}

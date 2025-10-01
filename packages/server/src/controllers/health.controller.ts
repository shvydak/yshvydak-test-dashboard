import {Request, Response} from 'express'
import {ResponseHelper} from '../utils/response.helper'

export class HealthController {
    // GET /api/health - Health check
    healthCheck = async (req: Request, res: Response): Promise<void> => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            service: 'yshvydak-test-dashboard-server',
        })
    }
}

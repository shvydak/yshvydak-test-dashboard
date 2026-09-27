import {Response} from 'express'
import {IJiraService} from '../services/jira.service'
import {ResponseHelper} from '../utils/response.helper'
import {Logger} from '../utils/logger.util'
import {ServiceRequest} from '../types/api.types'

// Generous ceiling for one GET /jira/tickets call — far above what a single screen of tests
// would ever carry as ticket-key tags. A request over this is almost certainly a caller bug,
// not a legitimate large list; reject it explicitly rather than silently truncating.
const MAX_TICKET_KEYS_PER_REQUEST = 200

export class JiraController {
    constructor(private jiraService: IJiraService) {}

    getStatus = async (_req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const status = await this.jiraService.getStatus()
            return ResponseHelper.success(res, status)
        } catch (error) {
            Logger.error('Error getting Jira connection status', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to get Jira connection status',
                500
            )
        }
    }

    getTickets = async (req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            const keysParam = req.query.keys
            if (typeof keysParam !== 'string' || !keysParam.trim()) {
                return ResponseHelper.success(res, [])
            }

            const keys = Array.from(
                new Set(
                    keysParam
                        .split(',')
                        .map((key) => key.trim())
                        .filter(Boolean)
                )
            )

            if (keys.length > MAX_TICKET_KEYS_PER_REQUEST) {
                return ResponseHelper.badRequest(
                    res,
                    `Too many keys: ${keys.length} (max ${MAX_TICKET_KEYS_PER_REQUEST})`
                )
            }

            const tickets = await this.jiraService.getTicketInfo(keys)
            return ResponseHelper.success(res, tickets)
        } catch (error) {
            Logger.error('Error getting Jira ticket info', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to get Jira ticket info',
                500
            )
        }
    }

    refresh = async (_req: ServiceRequest, res: Response): Promise<Response> => {
        try {
            if (!this.jiraService.isEnabled()) {
                return ResponseHelper.badRequest(
                    res,
                    'Jira integration is not configured (JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN)'
                )
            }

            const result = await this.jiraService.refreshAllKnownKeys()
            const status = await this.jiraService.getStatus()
            return ResponseHelper.success(res, {...result, lastSyncAt: status.lastSyncAt})
        } catch (error) {
            Logger.error('Error refreshing Jira tickets', error)
            return ResponseHelper.error(
                res,
                error instanceof Error ? error.message : 'Unknown error',
                'Failed to refresh Jira tickets',
                500
            )
        }
    }
}

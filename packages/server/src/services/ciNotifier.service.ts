import {config} from '../config/environment.config'
import {Logger} from '../utils/logger.util'
import {
    buildInterruptedMessage,
    buildNotStartedMessage,
    buildPausedMessage,
    buildReplacedMessage,
    buildResultMessage,
    buildStoppedMessage,
    buildTimeoutMessage,
    CISlackContext,
    PipelineResultStatus,
} from '../utils/ciSlackMessage.util'
import type {PipelineStepSummary} from './websocket.service'

const POST_TIMEOUT_MS = 10_000

/**
 * Posts CI pipeline outcomes to a Slack incoming webhook. Every method swallows its
 * own failures — a broken webhook must never reach the pipeline that triggered it.
 */
export class CINotifierService {
    private warnedDisabled = false
    private warnedNoLinkBase = false

    isEnabled(): boolean {
        return config.ci.slackWebhookUrl !== ''
    }

    notifyResult(
        pipeline: string,
        status: PipelineResultStatus,
        steps: PipelineStepSummary[]
    ): Promise<void> {
        return this.send(buildResultMessage(this.context(pipeline), status, steps))
    }

    notifyTimeout(pipeline: string, projects: string[]): Promise<void> {
        return this.send(buildTimeoutMessage(this.context(pipeline), projects))
    }

    notifyInterrupted(pipeline: string, projects: string[]): Promise<void> {
        return this.send(buildInterruptedMessage(this.context(pipeline), projects))
    }

    notifyStopped(pipeline: string, projects: string[]): Promise<void> {
        return this.send(buildStoppedMessage(this.context(pipeline), projects))
    }

    notifyReplaced(pipeline: string, projects: string[]): Promise<void> {
        return this.send(buildReplacedMessage(this.context(pipeline), projects))
    }

    notifyPaused(pipeline: string, message?: string): Promise<void> {
        return this.send(buildPausedMessage(this.context(pipeline), message))
    }

    notifyNotStarted(pipeline: string, reason: string, message?: string): Promise<void> {
        return this.send(buildNotStartedMessage(this.context(pipeline), reason, message))
    }

    private context(pipeline: string): CISlackContext {
        return {pipeline, dashboardUrl: config.ci.publicDashboardUrl}
    }

    private async send(text: string): Promise<void> {
        const url = config.ci.slackWebhookUrl
        if (!url) {
            if (!this.warnedDisabled) {
                this.warnedDisabled = true
                Logger.warn('CI Slack notifier is off: CI_SLACK_WEBHOOK_URL is not set')
            }
            return
        }

        if (!config.ci.publicDashboardUrl && !this.warnedNoLinkBase) {
            this.warnedNoLinkBase = true
            Logger.warn(
                'PUBLIC_DASHBOARD_URL is not set: CI Slack messages are posted without links'
            )
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({text}),
                signal: AbortSignal.timeout(POST_TIMEOUT_MS),
            })
            if (!response.ok) {
                Logger.error(`CI Slack notification failed: HTTP ${response.status}`)
            }
        } catch (error) {
            // Never log the URL — the webhook path is the secret.
            Logger.error('CI Slack notification failed', error)
        }
    }
}

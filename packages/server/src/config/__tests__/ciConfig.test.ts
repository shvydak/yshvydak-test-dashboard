import {describe, it, expect, afterEach} from 'vitest'
import {config} from '../environment.config'

const KEYS = ['CI_SLACK_WEBHOOK_URL', 'PUBLIC_DASHBOARD_URL', 'CI_PIPELINE_TIMEOUT_MINUTES']

describe('CI notifier config', () => {
    afterEach(() => {
        for (const key of KEYS) delete process.env[key]
    })

    it('has the notifier off, no link base and a 30 minute watchdog by default', () => {
        for (const key of KEYS) delete process.env[key]

        expect(config.ci.slackWebhookUrl).toBe('')
        expect(config.ci.publicDashboardUrl).toBe('')
        expect(config.ci.pipelineTimeoutMinutes).toBe(30)
    })

    it('trims the webhook and strips trailing slashes from the link base', () => {
        process.env.CI_SLACK_WEBHOOK_URL = '  https://hooks.example.com/x  '
        process.env.PUBLIC_DASHBOARD_URL = ' https://dash.example.com// '

        expect(config.ci.slackWebhookUrl).toBe('https://hooks.example.com/x')
        expect(config.ci.publicDashboardUrl).toBe('https://dash.example.com')
    })

    it('reads the watchdog minutes and falls back to 30 on junk or non-positive values', () => {
        process.env.CI_PIPELINE_TIMEOUT_MINUTES = '12'
        expect(config.ci.pipelineTimeoutMinutes).toBe(12)

        for (const bad of ['abc', '0', '-5', '']) {
            process.env.CI_PIPELINE_TIMEOUT_MINUTES = bad
            expect(config.ci.pipelineTimeoutMinutes).toBe(30)
        }
    })
})

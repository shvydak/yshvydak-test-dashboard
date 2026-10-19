import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {CINotifierService} from '../ciNotifier.service'

vi.mock('../../utils/logger.util', () => ({
    Logger: {info: vi.fn(), error: vi.fn(), warn: vi.fn()},
}))

import {Logger} from '../../utils/logger.util'

const WEBHOOK = 'https://hooks.example.com/services/T000/B000/secret'

describe('CINotifierService', () => {
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
        vi.clearAllMocks()
        fetchMock = vi.fn().mockResolvedValue({ok: true, status: 200})
        vi.stubGlobal('fetch', fetchMock)
        process.env.CI_SLACK_WEBHOOK_URL = WEBHOOK
        process.env.PUBLIC_DASHBOARD_URL = 'https://dash.example.com/'
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        delete process.env.CI_SLACK_WEBHOOK_URL
        delete process.env.PUBLIC_DASHBOARD_URL
    })

    it('is enabled only when the webhook is set', () => {
        const notifier = new CINotifierService()
        expect(notifier.isEnabled()).toBe(true)

        delete process.env.CI_SLACK_WEBHOOK_URL
        expect(notifier.isEnabled()).toBe(false)
    })

    it('posts {"text": ...} JSON to the webhook with the built message', async () => {
        await new CINotifierService().notifyResult('develop', 'completed', [
            {
                project: 'A',
                displayName: 'A tab',
                stopOnFailure: false,
                status: 'success',
                passed: 1,
                failed: 0,
            },
        ])

        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe(WEBHOOK)
        expect(init.method).toBe('POST')
        expect(init.headers).toEqual({'Content-Type': 'application/json'})
        const body = JSON.parse(init.body)
        expect(Object.keys(body)).toEqual(['text'])
        expect(body.text).toContain('✅ Test run passed')
        // trailing slash of PUBLIC_DASHBOARD_URL is trimmed
        expect(body.text).toContain('🔗 https://dash.example.com/tests?project=A')
    })

    it('routes every message kind through the same webhook', async () => {
        const notifier = new CINotifierService()

        await notifier.notifyTimeout('develop', ['A', 'B'])
        await notifier.notifyInterrupted('production', ['A'])
        await notifier.notifyPaused('develop', 'CI auto-run is paused')
        await notifier.notifyNotStarted('develop', 'pipeline_empty', 'No tabs')

        const texts = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).text as string)
        expect(texts[0]).toContain('⏱️ Timed out')
        expect(texts[1]).toContain('⚠️ Test run was interrupted')
        expect(texts[2]).toContain('⏸️ Auto-run is paused')
        expect(texts[3]).toContain('❌ Did not start (pipeline_empty)')
    })

    it('does nothing and logs once when the webhook is unset', async () => {
        delete process.env.CI_SLACK_WEBHOOK_URL
        const notifier = new CINotifierService()

        await notifier.notifyTimeout('develop', ['A'])
        await notifier.notifyTimeout('develop', ['A'])

        expect(fetchMock).not.toHaveBeenCalled()
        expect(Logger.warn).toHaveBeenCalledTimes(1)
        expect(vi.mocked(Logger.warn).mock.calls[0][0]).toContain('CI_SLACK_WEBHOOK_URL')
    })

    it('warns once that links are missing when PUBLIC_DASHBOARD_URL is unset, and posts without a link', async () => {
        delete process.env.PUBLIC_DASHBOARD_URL
        const notifier = new CINotifierService()

        await notifier.notifyTimeout('develop', ['A'])
        await notifier.notifyTimeout('develop', ['A'])

        expect(Logger.warn).toHaveBeenCalledTimes(1)
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).text).not.toContain('🔗')
    })

    it('logs a non-2xx answer and does not throw', async () => {
        fetchMock.mockResolvedValue({ok: false, status: 500})

        await expect(
            new CINotifierService().notifyTimeout('develop', ['A'])
        ).resolves.toBeUndefined()

        expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('HTTP 500'))
    })

    it('logs a network failure without the webhook URL and does not throw', async () => {
        fetchMock.mockRejectedValue(new Error('network down'))

        await expect(
            new CINotifierService().notifyTimeout('develop', ['A'])
        ).resolves.toBeUndefined()

        expect(Logger.error).toHaveBeenCalledTimes(1)
        const logged = JSON.stringify(vi.mocked(Logger.error).mock.calls)
        expect(logged).not.toContain('secret')
    })
})

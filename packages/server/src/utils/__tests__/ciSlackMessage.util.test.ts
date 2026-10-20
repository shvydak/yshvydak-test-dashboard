import {describe, expect, it} from 'vitest'
import type {PipelineStepSummary} from '../../services/websocket.service'
import {
    buildInterruptedMessage,
    buildNotStartedMessage,
    buildPausedMessage,
    buildReplacedMessage,
    buildResultMessage,
    buildStoppedMessage,
    buildTimeoutMessage,
    classifyPipelineOutcome,
} from '../ciSlackMessage.util'

const SEP = '-'.repeat(80)
const BASE = 'https://dash.example.com'
const ctx = (pipeline = 'develop', dashboardUrl = BASE) => ({pipeline, dashboardUrl})

const step = (
    project: string,
    status: PipelineStepSummary['status'],
    failed = 0,
    displayName = `${project} tab`
): PipelineStepSummary => ({
    project,
    displayName,
    stopOnFailure: false,
    status,
    passed: 1,
    failed,
})

const lines = (message: string) => message.split('\n')

describe('message block shape', () => {
    it('is an 80-dash separator, header, title, link, separator', () => {
        const message = buildResultMessage(ctx(), 'completed', [step('A', 'success')])

        expect(lines(message)).toEqual([
            SEP,
            '🧪 Automated tests · Development',
            '✅ Test run passed',
            `🔗 ${BASE}/tests?project=A`,
            SEP,
        ])
        expect(SEP).toHaveLength(80)
    })

    it.each([
        ['develop', 'Development'],
        ['production', 'Production'],
        ['staging', 'staging'],
    ])('labels the %s pipeline as %s', (pipeline, label) => {
        const message = buildResultMessage(ctx(pipeline), 'completed', [step('A', 'success')])

        expect(lines(message)[1]).toBe(`🧪 Automated tests · ${label}`)
    })

    it('omits the link line when no dashboard URL is configured', () => {
        const message = buildResultMessage(ctx('develop', ''), 'completed', [step('A', 'success')])

        expect(lines(message)).toEqual([
            SEP,
            '🧪 Automated tests · Development',
            '✅ Test run passed',
            SEP,
        ])
    })
})

describe('classifyPipelineOutcome', () => {
    it('is stopped_early whenever the pipeline stopped early', () => {
        expect(classifyPipelineOutcome('stopped_early', [step('A', 'failed', 2)])).toBe(
            'stopped_early'
        )
    })

    it('is completed_with_failures when a non-blocking step failed', () => {
        expect(
            classifyPipelineOutcome('completed', [step('A', 'success'), step('B', 'failed', 3)])
        ).toBe('completed_with_failures')
    })

    it('is completed_success with no failures', () => {
        expect(classifyPipelineOutcome('completed', [step('A', 'success')])).toBe(
            'completed_success'
        )
    })
})

describe('result title', () => {
    it('passed', () => {
        const message = buildResultMessage(ctx(), 'completed', [
            step('A', 'success'),
            step('B', 'success'),
        ])

        expect(lines(message)[2]).toBe('✅ Test run passed')
    })

    it('uses the singular for exactly one failed test', () => {
        const message = buildResultMessage(ctx(), 'completed', [
            step('A', 'success'),
            step('B', 'failed', 1, 'WEB Tests'),
        ])

        expect(lines(message)[2]).toBe('⚠️ 1 test failed in WEB Tests')
    })

    it('uses the plural and joins display names of every failing tab', () => {
        const message = buildResultMessage(ctx(), 'completed', [
            step('A', 'failed', 2, 'API Tests'),
            step('B', 'success'),
            step('C', 'failed', 3, 'WEB Tests'),
        ])

        expect(lines(message)[2]).toBe('⚠️ 5 tests failed in API Tests, WEB Tests')
    })

    it('falls back to the project slug when a step has no display name', () => {
        const message = buildResultMessage(ctx(), 'completed', [step('B', 'failed', 2, '')])

        expect(lines(message)[2]).toBe('⚠️ 2 tests failed in B')
    })

    it('names the failed step when the pipeline stopped early', () => {
        const message = buildResultMessage(ctx(), 'stopped_early', [
            step('A', 'failed', 2, 'API Tests'),
            step('B', 'skipped', 0, 'WEB Tests'),
        ])

        expect(lines(message)[2]).toBe('⛔ Stopped at API Tests — remaining steps were skipped')
    })

    it('names the blocking step, not an earlier non-blocking failure', () => {
        const message = buildResultMessage(ctx(), 'stopped_early', [
            step('UI', 'failed', 2, 'UI Tests'),
            step('API', 'failed', 1, 'API Tests'),
            step('X', 'skipped'),
        ])

        expect(lines(message)[2]).toBe('⛔ Stopped at API Tests — remaining steps were skipped')
        expect(lines(message)[3]).toBe(`🔗 ${BASE}/tests?project=API`)
    })

    it('says unknown tab when it stopped early with no failed step', () => {
        const message = buildResultMessage(ctx(), 'stopped_early', [
            step('A', 'skipped'),
            step('B', 'skipped'),
        ])

        expect(lines(message)[2]).toBe('⛔ Stopped at unknown tab — remaining steps were skipped')
    })
})

describe('paused mid-pipeline', () => {
    const steps = [step('A', 'success', 0, 'API Tests'), step('B', 'skipped', 0, 'WEB Tests')]

    it('uses the paused title, the same block and the pipeline link', () => {
        const message = buildResultMessage(ctx(), 'paused', steps)

        expect(lines(message)).toEqual([
            SEP,
            '🧪 Automated tests · Development',
            '⏸️ Paused — remaining steps were skipped',
            `🔗 ${BASE}/tests`,
            SEP,
        ])
    })

    it('links to the tab for a one-step pipeline', () => {
        const message = buildResultMessage(ctx('production'), 'paused', [step('Smoke', 'skipped')])

        expect(lines(message)[3]).toBe(`🔗 ${BASE}/tests?project=Smoke`)
    })

    it('classifies as paused', () => {
        expect(classifyPipelineOutcome('paused', steps)).toBe('paused')
    })
})

describe('result link rules', () => {
    it('one-step pipeline links to that tab', () => {
        const message = buildResultMessage(ctx(), 'completed', [step('Smoke', 'success')])

        expect(lines(message)[3]).toBe(`🔗 ${BASE}/tests?project=Smoke`)
    })

    it('several tabs, all passed, links to the unscoped list', () => {
        const message = buildResultMessage(ctx(), 'completed', [
            step('A', 'success'),
            step('B', 'success'),
        ])

        expect(lines(message)[3]).toBe(`🔗 ${BASE}/tests`)
    })

    it('one failing tab among several links to that tab', () => {
        const message = buildResultMessage(ctx(), 'completed', [
            step('A', 'success'),
            step('B', 'failed', 2),
        ])

        expect(lines(message)[3]).toBe(`🔗 ${BASE}/tests?project=B`)
    })

    it('several failing tabs link to the unscoped list', () => {
        const message = buildResultMessage(ctx(), 'completed', [
            step('A', 'failed', 1),
            step('B', 'failed', 1),
        ])

        expect(lines(message)[3]).toBe(`🔗 ${BASE}/tests`)
    })

    it('stopped early links to the failed step, even in a multi-step pipeline', () => {
        const message = buildResultMessage(ctx(), 'stopped_early', [
            step('A', 'success'),
            step('B', 'failed', 4),
            step('C', 'skipped'),
        ])

        expect(lines(message)[3]).toBe(`🔗 ${BASE}/tests?project=B`)
    })

    it('stopped early with no failed step falls back to the pipeline link', () => {
        const multi = buildResultMessage(ctx(), 'stopped_early', [
            step('A', 'skipped'),
            step('B', 'skipped'),
        ])
        const single = buildResultMessage(ctx(), 'stopped_early', [step('A', 'skipped')])

        expect(lines(multi)[3]).toBe(`🔗 ${BASE}/tests`)
        expect(lines(single)[3]).toBe(`🔗 ${BASE}/tests?project=A`)
    })

    it('the URL carries the project slug while the text carries the display name', () => {
        const message = buildResultMessage(ctx(), 'completed', [
            step('API_Tests', 'failed', 2, 'API Tests'),
            step('WEB_Tests', 'success', 0, 'WEB Tests (CI)'),
        ])

        expect(lines(message)[2]).toBe('⚠️ 2 tests failed in API Tests')
        expect(lines(message)[3]).toBe(`🔗 ${BASE}/tests?project=API_Tests`)
    })

    it('percent-encodes a slug that is not URL safe', () => {
        const message = buildResultMessage(ctx(), 'completed', [step('My Tests', 'success')])

        expect(lines(message)[3]).toBe(`🔗 ${BASE}/tests?project=My%20Tests`)
    })
})

describe('timeout and interrupted messages', () => {
    it('timeout uses the one-step link for a one-step pipeline', () => {
        const message = buildTimeoutMessage(ctx('production'), ['Smoke'])

        expect(lines(message)).toEqual([
            SEP,
            '🧪 Automated tests · Production',
            '⏱️ Timed out — dashboard did not report completion',
            `🔗 ${BASE}/tests?project=Smoke`,
            SEP,
        ])
    })

    it('timeout links to the unscoped list for several tabs', () => {
        expect(lines(buildTimeoutMessage(ctx(), ['A', 'B']))[3]).toBe(`🔗 ${BASE}/tests`)
    })

    it('interrupted carries the restart title and the pipeline link', () => {
        const message = buildInterruptedMessage(ctx(), ['A', 'B'])

        expect(lines(message)).toEqual([
            SEP,
            '🧪 Automated tests · Development',
            '⚠️ Test run was interrupted — the dashboard restarted',
            `🔗 ${BASE}/tests`,
            SEP,
        ])
    })
})

describe('stopped and replaced messages', () => {
    it('manual stop: same 80-dash block, header and pipeline link, no result claimed', () => {
        const message = buildStoppedMessage(ctx(), ['A', 'B'])

        expect(lines(message)).toEqual([
            SEP,
            '🧪 Automated tests · Development',
            '⏹️ Stopped manually — no result for this run',
            `🔗 ${BASE}/tests`,
            SEP,
        ])
    })

    it('manual stop of a one-step pipeline deep-links to that tab', () => {
        const message = buildStoppedMessage(ctx('production'), ['Smoke'])

        expect(lines(message)[1]).toBe('🧪 Automated tests · Production')
        expect(lines(message)[3]).toBe(`🔗 ${BASE}/tests?project=Smoke`)
    })

    it('replaced: names the newer deploy', () => {
        const message = buildReplacedMessage(ctx(), ['A'])

        expect(lines(message)).toEqual([
            SEP,
            '🧪 Automated tests · Development',
            '⏹️ Cancelled by a newer deploy — a new run has started',
            `🔗 ${BASE}/tests?project=A`,
            SEP,
        ])
    })

    it('both omit the link line when no dashboard URL is configured', () => {
        expect(
            lines(buildStoppedMessage(ctx('develop', ''), ['A'])).some((l) => l.startsWith('🔗'))
        ).toBe(false)
        expect(
            lines(buildReplacedMessage(ctx('develop', ''), ['A'])).some((l) => l.startsWith('🔗'))
        ).toBe(false)
    })
})

describe('did-not-start messages', () => {
    it('paused carries the pause message as the body', () => {
        const message = buildPausedMessage(ctx(), 'CI auto-run is paused')

        expect(lines(message)).toEqual([
            SEP,
            '🧪 Automated tests · Development',
            '⏸️ Auto-run is paused — tests were not started',
            'CI auto-run is paused',
            SEP,
        ])
    })

    it('paused falls back to the Settings hint', () => {
        expect(lines(buildPausedMessage(ctx()))[3]).toBe('CI auto-run is paused in Settings.')
    })

    it('not started names the reason and carries the message', () => {
        const message = buildNotStartedMessage(ctx('production'), 'pipeline_empty', 'No tabs')

        expect(lines(message)).toEqual([
            SEP,
            '🧪 Automated tests · Production',
            '❌ Did not start (pipeline_empty)',
            'No tabs',
            SEP,
        ])
    })

    it('not started falls back to a logs hint', () => {
        expect(lines(buildNotStartedMessage(ctx(), 'trigger_failed'))[3]).toBe(
            'See dashboard logs for details.'
        )
    })
})

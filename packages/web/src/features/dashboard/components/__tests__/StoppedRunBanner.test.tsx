import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {act, fireEvent, render, screen} from '@testing-library/react'
import {StoppedRunBanner} from '../StoppedRunBanner'
import type {LastStop} from '@/hooks/usePipelineStatus'

const NOW = Date.parse('2026-11-17T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const HOUR = 3_600_000
const MIN = 60_000

const step = (project: string, status: any, extra: Record<string, unknown> = {}) => ({
    project,
    displayName: project,
    stopOnFailure: false,
    status,
    ...extra,
})

const pipelineStop = (over: Partial<LastStop> = {}): LastStop => ({
    stoppedAt: ago(2 * HOUR),
    reason: 'manual',
    kind: 'pipeline',
    name: 'develop',
    pipelineRunId: 'p1',
    steps: [
        step('Smoke', 'stopped', {runId: 'r1', passed: 12, failed: 1}),
        step('API', 'skipped'),
        step('UI', 'skipped'),
    ],
    ...over,
})

const runStop = (over: Partial<LastStop> = {}): LastStop => ({
    stoppedAt: ago(5 * MIN),
    reason: 'manual',
    kind: 'run-all',
    name: 'API',
    ...over,
})

describe("StoppedRunBanner (the server's last stop, the same for every tab)", () => {
    beforeEach(() => {
        vi.useFakeTimers({toFake: ['Date', 'setInterval', 'clearInterval']})
        vi.setSystemTime(NOW)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    describe('a pipeline stop', () => {
        it('says it was stopped manually, how long ago, what ran and what did not, and that the results are kept', () => {
            render(<StoppedRunBanner lastStop={pipelineStop()} />)

            expect(
                screen.getByText('Develop pipeline stopped manually · 2 h ago')
            ).toBeInTheDocument()
            expect(
                screen.getByText(
                    'Smoke: 12 passed, 1 failed · API, UI not run. Results so far are kept.'
                )
            ).toBeInTheDocument()
        })

        it('a fresh stop reads "just now" and the time keeps updating while the banner is open', () => {
            render(<StoppedRunBanner lastStop={pipelineStop({stoppedAt: ago(0)})} />)
            expect(
                screen.getByText('Develop pipeline stopped manually · just now')
            ).toBeInTheDocument()

            act(() => {
                vi.setSystemTime(NOW + 12 * MIN - 30_000)
                vi.advanceTimersByTime(30_000)
            })

            expect(
                screen.getByText('Develop pipeline stopped manually · 12 min ago')
            ).toBeInTheDocument()
        })

        it('marks the cut step with a neutral "Stopped" chip', () => {
            render(<StoppedRunBanner lastStop={pipelineStop()} />)

            expect(screen.getByText('Smoke: Stopped')).toBeInTheDocument()
        })

        it('a time-limit stop names the limit and the time', () => {
            render(
                <StoppedRunBanner
                    lastStop={pipelineStop({
                        reason: 'timeout',
                        timeLimitMinutes: 30,
                        stoppedAt: ago(3 * HOUR),
                    })}
                />
            )

            expect(
                screen.getByText('Develop pipeline stopped after 30 min (time limit) · 3 h ago')
            ).toBeInTheDocument()
        })

        it('finished steps keep their counts', () => {
            render(
                <StoppedRunBanner
                    lastStop={pipelineStop({
                        steps: [
                            step('API', 'success', {passed: 5, failed: 0}),
                            step('WEB', 'stopped', {passed: 3, failed: 0}),
                            step('UI', 'skipped'),
                        ],
                    })}
                />
            )
            expect(
                screen.getByText(
                    'API: 5 passed · WEB: 3 passed · UI not run. Results so far are kept.'
                )
            ).toBeInTheDocument()
        })
    })

    describe('a standalone run stop (seen by a tab that opened after it)', () => {
        it.each([
            [runStop(), 'Run All — API stopped manually · 5 min ago'],
            [
                runStop({kind: 'run-group', name: 'login.spec.ts'}),
                'Run of login.spec.ts stopped manually · 5 min ago',
            ],
            [
                runStop({kind: 'rerun', name: 'user can log in'}),
                'Rerun of user can log in stopped manually · 5 min ago',
            ],
            [runStop({kind: 'run', name: undefined}), 'Run stopped manually · 5 min ago'],
        ])('names what was stopped, how long ago', (stop, title) => {
            render(<StoppedRunBanner lastStop={stop} />)

            expect(screen.getByText(title)).toBeInTheDocument()
            expect(screen.getByText('Results so far are kept.')).toBeInTheDocument()
        })
    })

    it('nothing stopped, or the server called the notice over (null): nothing is shown', () => {
        const {container} = render(<StoppedRunBanner lastStop={null} />)

        expect(container).toBeEmptyDOMElement()
    })

    it('goes away when the server ends it (a newer run finished); a fresh mount (reload) with null shows nothing', () => {
        const view = render(<StoppedRunBanner lastStop={pipelineStop()} />)
        expect(screen.getByText(/Develop pipeline stopped manually/)).toBeInTheDocument()

        view.rerender(<StoppedRunBanner lastStop={null} />)
        expect(screen.queryByText(/stopped manually/)).toBeNull()

        view.unmount()
        const {container} = render(<StoppedRunBanner lastStop={null} />)
        expect(container).toBeEmptyDOMElement()
    })

    it('a newer stop replaces the older one, even after the X hid the older', () => {
        const view = render(<StoppedRunBanner lastStop={pipelineStop()} />)
        fireEvent.click(screen.getByRole('button', {name: /dismiss/i}))
        expect(screen.queryByText(/Develop pipeline/)).toBeNull()

        view.rerender(<StoppedRunBanner lastStop={runStop({stoppedAt: ago(0)})} />)

        expect(screen.getByText('Run All — API stopped manually · just now')).toBeInTheDocument()
    })

    it('the X hides it only until a reload: a fresh mount shows it again, nothing is persisted', () => {
        const view = render(<StoppedRunBanner lastStop={runStop()} />)

        fireEvent.click(screen.getByRole('button', {name: /dismiss/i}))
        expect(screen.queryByText(/Run All — API/)).toBeNull()

        view.unmount()
        render(<StoppedRunBanner lastStop={runStop()} />)
        expect(screen.getByText(/Run All — API stopped manually/)).toBeInTheDocument()
        expect(localStorage.length).toBe(0)
    })
})

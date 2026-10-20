import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import type {MockInstance} from 'vitest'

vi.mock('child_process', () => ({execFile: vi.fn()}))
vi.mock('../logger.util', () => ({
    Logger: {info: vi.fn(), error: vi.fn(), warn: vi.fn()},
}))

import {execFile} from 'child_process'
import {killLeftoverPlaywrightGroups, signalGroup} from '../processGroup.util'

// `ps -A -o pgid=,etime=,command=` rows
function stubPs(rows: string[] | Error) {
    vi.mocked(execFile).mockImplementation(((
        _cmd: string,
        _args: string[],
        _opts: any,
        cb: any
    ) => {
        if (rows instanceof Error) cb(rows, '')
        else cb(null, rows.join('\n'))
    }) as any)
}

describe('processGroup.util', () => {
    let kill: MockInstance<any>

    beforeEach(() => {
        kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    })

    describe('signalGroup', () => {
        it('signals the group with a negative pgid', () => {
            expect(signalGroup(321, 'SIGKILL')).toBe(true)
            expect(kill).toHaveBeenCalledWith(-321, 'SIGKILL')
        })

        it('reports a vanished group as false instead of throwing', () => {
            kill.mockImplementation(() => {
                throw Object.assign(new Error('gone'), {code: 'ESRCH'})
            })

            expect(signalGroup(321, 'SIGKILL')).toBe(false)
        })
    })

    describe('killLeftoverPlaywrightGroups', () => {
        const T0 = new Date('2026-01-01T12:00:00.000Z')

        beforeEach(() => {
            vi.useFakeTimers({toFake: ['Date']})
            vi.setSystemTime(T0)
        })

        afterEach(() => {
            vi.useRealTimers()
        })

        // The marker was written 10 minutes before "now".
        const WRITTEN = new Date(T0.getTime() - 10 * 60_000).toISOString()

        it('SIGKILLs a marker group that is still alive, runs Playwright and started before the marker', async () => {
            stubPs([
                ' 900 12:00 npm exec playwright test',
                ' 901 12:00 node /x/node_modules/playwright/lib/common/process.js',
                '  50 05-12:00:00 /usr/sbin/cron',
            ])

            const killed = await killLeftoverPlaywrightGroups([
                {pgid: 900, markerWrittenAt: WRITTEN},
            ])

            expect(killed).toEqual([900])
            expect(kill).toHaveBeenCalledWith(-900, 'SIGKILL')
        })

        it('leaves a fresh, unrelated Playwright run alone when the group id was reused (younger than the marker)', async () => {
            // started 2 minutes ago, the marker was written 10 minutes ago
            stubPs([' 900 02:00 node /home/me/proj/node_modules/.bin/playwright test'])

            const killed = await killLeftoverPlaywrightGroups([
                {pgid: 900, markerWrittenAt: WRITTEN},
            ])

            expect(killed).toEqual([])
            expect(kill).not.toHaveBeenCalled()
        })

        it('allows a few seconds of slack between the spawn and the marker write, not more', async () => {
            // started 8 s after the marker was written: inside the slack
            stubPs([' 900 09:52 node playwright test'])
            expect(
                await killLeftoverPlaywrightGroups([{pgid: 900, markerWrittenAt: WRITTEN}])
            ).toEqual([900])

            // started 20 s after: a different run
            kill.mockClear()
            stubPs([' 900 09:40 node playwright test'])
            expect(
                await killLeftoverPlaywrightGroups([{pgid: 900, markerWrittenAt: WRITTEN}])
            ).toEqual([])
            expect(kill).not.toHaveBeenCalled()
        })

        it('reads the days-hours-minutes etime format', async () => {
            stubPs([' 900 2-03:04:05 node playwright test'])

            expect(
                await killLeftoverPlaywrightGroups([{pgid: 900, markerWrittenAt: WRITTEN}])
            ).toEqual([900])
        })

        it('does not kill when the age cannot be read', async () => {
            stubPs([' 900 ??? node playwright test'])

            expect(
                await killLeftoverPlaywrightGroups([{pgid: 900, markerWrittenAt: WRITTEN}])
            ).toEqual([])
        })

        it('falls back to the command check alone for a marker without a write time (older marker)', async () => {
            stubPs([' 900 00:05 node playwright test'])

            expect(await killLeftoverPlaywrightGroups([{pgid: 900}])).toEqual([900])
        })

        it('leaves a group alone when it is not Playwright (stale marker after a reboot)', async () => {
            stubPs([' 900 20:00 /usr/bin/ssh-agent', ' 901 20:00 -zsh'])

            const killed = await killLeftoverPlaywrightGroups([
                {pgid: 900, markerWrittenAt: WRITTEN},
            ])

            expect(killed).toEqual([])
            expect(kill).not.toHaveBeenCalled()
        })

        it('does nothing for a group that no longer exists', async () => {
            stubPs([' 50 20:00 /usr/sbin/cron'])

            expect(await killLeftoverPlaywrightGroups([{pgid: 900}])).toEqual([])
            expect(kill).not.toHaveBeenCalled()
        })

        it('never signals pgid 0/1 or garbage, and skips listing processes when there is nothing to check', async () => {
            const bad = [0, 1, -5, 1.5, NaN].map((pgid) => ({pgid}))
            expect(await killLeftoverPlaywrightGroups(bad)).toEqual([])

            expect(execFile).not.toHaveBeenCalled()
            expect(kill).not.toHaveBeenCalled()
        })

        it('kills nothing when the process list cannot be read', async () => {
            stubPs(new Error('ps: command not found'))

            expect(await killLeftoverPlaywrightGroups([{pgid: 900}])).toEqual([])
            expect(kill).not.toHaveBeenCalled()
        })
    })
})

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import type {MockInstance} from 'vitest'
import {EventEmitter} from 'events'
import {RunProcessRegistry} from '../runProcessRegistry.service'

vi.mock('../../utils/logger.util', () => ({
    Logger: {info: vi.fn(), error: vi.fn(), warn: vi.fn()},
}))

type FakeChild = EventEmitter & {
    pid?: number
    exitCode: number | null
    signalCode: string | null
    kill: ReturnType<typeof vi.fn>
}

function fakeChild(pid?: number): FakeChild {
    const child = new EventEmitter() as FakeChild
    child.pid = pid
    child.exitCode = null
    child.signalCode = null
    child.kill = vi.fn()
    return child
}

const meta = (runId: string) => ({runId, type: 'run-all' as const, project: 'API'})

describe('RunProcessRegistry', () => {
    let registry: RunProcessRegistry
    let kill: MockInstance<any>

    beforeEach(() => {
        registry = new RunProcessRegistry()
        kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    describe('busy source', () => {
        it('is busy from register until the child closes', () => {
            const child = fakeChild(100)
            registry.register(meta('r1'), child as any)

            expect(registry.isAnyRunning()).toBe(true)
            expect(registry.has('r1')).toBe(true)

            child.emit('close', 0)
            expect(registry.isAnyRunning()).toBe(false)
            expect(registry.has('r1')).toBe(false)
        })

        it('does not depend on anything else: the entry stays until the process really closes', () => {
            registry.register(meta('r1'), fakeChild(100) as any)

            // The progress tracker may drop its entry (reporter process-end, 30 min purge): irrelevant here.
            expect(registry.getRuns()).toHaveLength(1)
            expect(registry.getPgids()).toEqual([100])
        })

        it('ignores a missing child and a child that already exited', () => {
            registry.register(meta('r1'), undefined)
            const exited = fakeChild(101)
            exited.exitCode = 0
            registry.register(meta('r2'), exited as any)
            const killed = fakeChild(102)
            killed.signalCode = 'SIGKILL'
            registry.register(meta('r3'), killed as any)

            expect(registry.isAnyRunning()).toBe(false)
        })

        it('drops a child whose spawn failed (no pid) on error, but not a live one', () => {
            const failed = fakeChild(undefined)
            registry.register(meta('r1'), failed as any)
            const live = fakeChild(200)
            registry.register(meta('r2'), live as any)

            failed.emit('error', new Error('spawn npx ENOENT'))
            live.emit('error', new Error('send failed'))

            expect(registry.has('r1')).toBe(false)
            expect(registry.has('r2')).toBe(true)
        })

        it('whenClosed resolves at once for an unknown run and on close for a live one', async () => {
            await registry.whenClosed('nope')

            const child = fakeChild(100)
            registry.register(meta('r1'), child as any)
            let closed = false
            registry.whenClosed('r1').then(() => (closed = true))
            await Promise.resolve()
            expect(closed).toBe(false)

            child.emit('close', 0)
            await Promise.resolve()
            expect(closed).toBe(true)
        })
    })

    describe('terminate', () => {
        it('SIGINTs the whole process group (negative pgid), not just the pid', () => {
            registry.register(meta('r1'), fakeChild(4242) as any)

            registry.terminate('r1')

            expect(kill).toHaveBeenCalledWith(-4242, 'SIGINT')
        })

        it('resolves when the child closes after SIGINT and never sends SIGKILL', async () => {
            vi.useFakeTimers()
            const child = fakeChild(4242)
            registry.register(meta('r1'), child as any)

            const done = registry.terminate('r1', 20_000)
            child.emit('close', 130)
            await done
            await vi.advanceTimersByTimeAsync(60_000)

            expect(kill).toHaveBeenCalledTimes(1)
            expect(kill).not.toHaveBeenCalledWith(-4242, 'SIGKILL')
        })

        it('SIGKILLs the group when SIGINT is ignored for the grace period', async () => {
            vi.useFakeTimers()
            const child = fakeChild(4242)
            registry.register(meta('r1'), child as any)

            const done = registry.terminate('r1', 20_000, 5_000)
            await vi.advanceTimersByTimeAsync(19_999)
            expect(kill).not.toHaveBeenCalledWith(-4242, 'SIGKILL')

            await vi.advanceTimersByTimeAsync(2)
            expect(kill).toHaveBeenCalledWith(-4242, 'SIGKILL')

            child.emit('close', null)
            await done
        })

        it('gives up waiting when the child never closes even after SIGKILL', async () => {
            vi.useFakeTimers()
            registry.register(meta('r1'), fakeChild(4242) as any)

            const done = registry.terminate('r1', 1_000, 500)
            await vi.advanceTimersByTimeAsync(1_600)

            await expect(done).resolves.toBeUndefined()
        })

        it('falls back to child.kill() when there is no pid to build a group from', () => {
            const child = fakeChild(undefined)
            registry.register(meta('r1'), child as any)

            registry.terminate('r1')

            expect(child.kill).toHaveBeenCalledWith('SIGINT')
            expect(kill).not.toHaveBeenCalled()
        })

        it('an already vanished group (ESRCH) is not an error', () => {
            kill.mockImplementation(() => {
                throw Object.assign(new Error('no such process'), {code: 'ESRCH'})
            })
            registry.register(meta('r1'), fakeChild(4242) as any)

            expect(() => registry.terminate('r1')).not.toThrow()
        })

        it('falls back to child.kill() when the group signal fails and the child is alive (not spawned detached)', () => {
            kill.mockImplementation(() => {
                throw Object.assign(new Error('no such process'), {code: 'ESRCH'})
            })
            const child = fakeChild(4242)
            registry.register(meta('r1'), child as any)

            registry.terminate('r1')

            expect(child.kill).toHaveBeenCalledWith('SIGINT')
        })

        it('does not touch a child that already exited when the group signal fails', () => {
            kill.mockImplementation(() => {
                throw Object.assign(new Error('no such process'), {code: 'ESRCH'})
            })
            const child = fakeChild(4242)
            registry.register(meta('r1'), child as any)
            child.exitCode = 0

            registry.terminate('r1')

            expect(child.kill).not.toHaveBeenCalled()
        })

        it('the shutdown SIGKILL also falls back to the child', async () => {
            vi.useFakeTimers()
            kill.mockImplementation(() => {
                throw Object.assign(new Error('no such process'), {code: 'ESRCH'})
            })
            const child = fakeChild(4242)
            registry.register(meta('r1'), child as any)

            const done = registry.terminateAll(2_500)
            await vi.advanceTimersByTimeAsync(2_500)
            await done

            expect(child.kill).toHaveBeenCalledWith('SIGINT')
            expect(child.kill).toHaveBeenCalledWith('SIGKILL')
        })

        it('is a no-op for a run that is not registered', async () => {
            await registry.terminate('ghost')

            expect(kill).not.toHaveBeenCalled()
        })
    })

    describe('terminateAll (server shutdown)', () => {
        it('SIGINTs every group, marks the registry as shutting down, and returns once all closed', async () => {
            vi.useFakeTimers()
            const a = fakeChild(11)
            const b = fakeChild(22)
            registry.register(meta('a'), a as any)
            registry.register(meta('b'), b as any)

            const done = registry.terminateAll(2_500)
            expect(registry.isShuttingDown()).toBe(true)
            expect(kill).toHaveBeenCalledWith(-11, 'SIGINT')
            expect(kill).toHaveBeenCalledWith(-22, 'SIGINT')

            a.emit('close', 130)
            b.emit('close', 130)
            await done

            expect(kill).not.toHaveBeenCalledWith(-11, 'SIGKILL')
            expect(kill).not.toHaveBeenCalledWith(-22, 'SIGKILL')
        })

        it('SIGKILLs only the groups still alive after the grace period', async () => {
            vi.useFakeTimers()
            const polite = fakeChild(11)
            const stubborn = fakeChild(22)
            registry.register(meta('a'), polite as any)
            registry.register(meta('b'), stubborn as any)

            const done = registry.terminateAll(2_500)
            polite.emit('close', 130)
            await vi.advanceTimersByTimeAsync(2_500)
            await done

            expect(kill).not.toHaveBeenCalledWith(-11, 'SIGKILL')
            expect(kill).toHaveBeenCalledWith(-22, 'SIGKILL')
        })

        it('returns at once when nothing is running, still marking shutdown', async () => {
            await registry.terminateAll(2_500)

            expect(registry.isShuttingDown()).toBe(true)
            expect(kill).not.toHaveBeenCalled()
        })
    })

    describe('stop generation and cancelled runs', () => {
        it('beginStop bumps the generation so a start that captured an older one can notice', () => {
            const before = registry.getStopGeneration()

            registry.beginStop()

            expect(registry.getStopGeneration()).toBe(before + 1)
        })

        it('remembers cancelled run ids and nothing else', () => {
            registry.markCancelled(['a', 'b'])

            expect(registry.isCancelled('a')).toBe(true)
            expect(registry.isCancelled('b')).toBe(true)
            expect(registry.isCancelled('c')).toBe(false)
        })

        it('keeps the cancelled set bounded, dropping the oldest ids', () => {
            const ids = Array.from({length: 600}, (_, i) => `run-${i}`)

            registry.markCancelled(ids)

            expect(registry.isCancelled('run-0')).toBe(false)
            expect(registry.isCancelled('run-599')).toBe(true)
        })
    })
})

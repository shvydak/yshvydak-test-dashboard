import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import type {MockInstance} from 'vitest'
import {EventEmitter} from 'events'

vi.mock('../utils/logger.util', () => ({
    Logger: {info: vi.fn(), error: vi.fn(), warn: vi.fn(), serverStart: vi.fn()},
}))
vi.mock('../app', () => ({createApp: vi.fn()}))
vi.mock('../websocket/server', () => ({
    createWebSocketServer: vi.fn(),
    setWebSocketManager: vi.fn(),
}))
vi.mock('../database/database.manager', () => ({
    DatabaseManager: vi.fn(function () {
        return {close: vi.fn()}
    }),
}))

import {createApp} from '../app'
import {createWebSocketServer} from '../websocket/server'
import {startServer} from '../server'
import {runProcessRegistry} from '../services/runProcessRegistry.service'

describe('server startup and graceful shutdown', () => {
    let handlers: Record<string, (...args: any[]) => unknown>
    let events: string[]
    let kill: MockInstance<any>
    let exit: MockInstance<any>
    const originalSend = process.send

    beforeEach(() => {
        vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
        handlers = {}
        events = []
        ;(process as any).send = undefined
        vi.spyOn(process, 'on').mockImplementation(((event: string, handler: any) => {
            handlers[event] = handler
            return process
        }) as any)
        kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
        exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any)

        const httpServer = {
            close: vi.fn((cb: () => void) => {
                events.push('http-close')
                cb()
            }),
        }
        vi.mocked(createApp).mockResolvedValue({
            app: {
                listen: vi.fn((_port: number, cb: () => void) => {
                    events.push('listen')
                    cb()
                    return httpServer
                }),
            },
            serviceContainer: {
                pipelineExecutionService: {
                    handleInterruptedOnStartup: vi.fn(async () => {
                        events.push('startup-cleanup')
                    }),
                },
                jiraService: {isEnabled: () => false},
            },
        } as any)
        vi.mocked(createWebSocketServer).mockReturnValue({
            close: vi.fn((cb: () => void) => {
                events.push('ws-close')
                cb()
            }),
        } as any)
    })

    afterEach(() => {
        ;(process as any).send = originalSend
        vi.useRealTimers()
    })

    it('cleans up after an interrupted run BEFORE the server accepts requests', async () => {
        await startServer()

        expect(events.indexOf('startup-cleanup')).toBeGreaterThanOrEqual(0)
        expect(events.indexOf('startup-cleanup')).toBeLessThan(events.indexOf('listen'))
    })

    it('shutdown stops the Playwright groups first (SIGINT to the whole group), then closes the server', async () => {
        await startServer()
        const child: any = new EventEmitter()
        child.pid = 4242
        child.exitCode = null
        child.signalCode = null
        runProcessRegistry.register({runId: 'live-run', type: 'run-all'}, child)

        const shutdown = handlers['SIGTERM']('SIGTERM') as Promise<void>
        await vi.advanceTimersByTimeAsync(0)

        expect(kill).toHaveBeenCalledWith(-4242, 'SIGINT')
        expect(events).not.toContain('http-close')

        child.emit('close', 130)
        await shutdown

        expect(events.slice(-2)).toEqual(['http-close', 'ws-close'])
        expect(exit).toHaveBeenCalledWith(0)
        expect(kill).not.toHaveBeenCalledWith(-4242, 'SIGKILL')
    })

    it('SIGKILLs a group that ignores SIGINT inside pm2 kill_timeout (5 s), then still exits cleanly', async () => {
        await startServer()
        const child: any = new EventEmitter()
        child.pid = 4343
        child.exitCode = null
        child.signalCode = null
        runProcessRegistry.register({runId: 'stubborn-run', type: 'run-all'}, child)

        const shutdown = handlers['SIGINT']('SIGINT') as Promise<void>
        await vi.advanceTimersByTimeAsync(2_500)
        await shutdown

        expect(kill).toHaveBeenCalledWith(-4343, 'SIGINT')
        expect(kill).toHaveBeenCalledWith(-4343, 'SIGKILL')
        expect(exit).toHaveBeenCalledWith(0)
        // forced-exit deadline stays under pm2's kill_timeout
        await vi.advanceTimersByTimeAsync(2_000)
        expect(exit).toHaveBeenCalledWith(1)

        child.emit('close', null)
    })
})

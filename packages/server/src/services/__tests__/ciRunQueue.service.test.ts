import {describe, it, expect, vi, beforeEach} from 'vitest'
import {CIRunQueueService} from '../ciRunQueue.service'

vi.mock('../../utils/logger.util', () => ({
    Logger: {info: vi.fn(), error: vi.fn(), warn: vi.fn()},
}))

vi.mock('../activeProcesses.service', () => ({
    activeProcessesTracker: {
        isAnyProcessRunning: vi.fn(() => false),
    },
}))

import {activeProcessesTracker} from '../activeProcesses.service'

describe('CIRunQueueService', () => {
    let queue: CIRunQueueService
    let mockWebSocket: {broadcastPipelineQueueChanged: ReturnType<typeof vi.fn>}

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(activeProcessesTracker.isAnyProcessRunning).mockReturnValue(false)
        mockWebSocket = {broadcastPipelineQueueChanged: vi.fn()}
        queue = new CIRunQueueService(mockWebSocket as any)
    })

    describe('isBusy', () => {
        it('is idle with nothing tracked, no pipeline and nothing starting', () => {
            expect(queue.isBusy()).toBe(false)
        })

        it('is busy while a process is tracked', () => {
            vi.mocked(activeProcessesTracker.isAnyProcessRunning).mockReturnValue(true)
            expect(queue.isBusy()).toBe(true)
        })

        it('is busy while the registered pipeline provider says running', () => {
            let running = true
            queue.registerPipelineRunning(() => running)

            expect(queue.isBusy()).toBe(true)
            running = false
            expect(queue.isBusy()).toBe(false)
        })

        it('ignorePipeline hides only the pipeline flag', () => {
            queue.registerPipelineRunning(() => true)

            expect(queue.isBusy()).toBe(true)
            expect(queue.isBusy({ignorePipeline: true})).toBe(false)

            const release = queue.beginStarting()
            expect(queue.isBusy({ignorePipeline: true})).toBe(true)
            release()

            vi.mocked(activeProcessesTracker.isAnyProcessRunning).mockReturnValue(true)
            expect(queue.isBusy({ignorePipeline: true})).toBe(true)
        })

        it('is busy from beginStarting until released, and a release is idempotent', () => {
            const releaseA = queue.beginStarting()
            const releaseB = queue.beginStarting()

            releaseA()
            releaseA()
            expect(queue.isBusy()).toBe(true)

            releaseB()
            expect(queue.isBusy()).toBe(false)
        })
    })

    describe('releasing the starting claim', () => {
        const flush = () => new Promise((resolve) => setImmediate(resolve))

        it('requests a drain once the last claim is released (a failed start never closes a process)', async () => {
            const handler = vi.fn().mockResolvedValue(undefined)
            queue.registerDrainHandler(handler)
            queue.enqueue('develop')
            const releaseA = queue.beginStarting()
            const releaseB = queue.beginStarting()

            releaseA()
            await flush()
            expect(handler).not.toHaveBeenCalled()

            releaseB()
            releaseB()
            await flush()
            expect(handler).toHaveBeenCalledTimes(1)
        })
    })

    describe('slots', () => {
        it('replaces the queued request of the same pipeline and reports it', () => {
            expect(queue.enqueue('develop', 1)).toBe(false)
            expect(queue.enqueue('develop', 4)).toBe(true)

            expect(queue.getQueue()).toEqual([
                expect.objectContaining({pipeline: 'develop', maxWorkers: 4}),
            ])
        })

        it('takes production first, then develop', () => {
            queue.enqueue('develop')
            queue.enqueue('production')

            expect(queue.takeNext()?.pipeline).toBe('production')
            expect(queue.takeNext()?.pipeline).toBe('develop')
            expect(queue.takeNext()).toBeUndefined()
        })

        it('orders an unknown pipeline name after the known ones', () => {
            queue.enqueue('staging' as any)
            queue.enqueue('develop')
            queue.enqueue('production')

            expect(queue.getQueue().map((q) => q.pipeline)).toEqual([
                'production',
                'develop',
                'staging',
            ])
        })

        it('broadcasts the queue on every change', () => {
            queue.enqueue('develop')
            queue.enqueue('production')
            queue.takeNext()

            expect(mockWebSocket.broadcastPipelineQueueChanged).toHaveBeenCalledTimes(3)
            expect(mockWebSocket.broadcastPipelineQueueChanged).toHaveBeenLastCalledWith([
                expect.objectContaining({pipeline: 'develop'}),
            ])
        })

        it('requeue restores a taken request but never overwrites a newer one', () => {
            queue.enqueue('develop', 1)
            const taken = queue.takeNext()!

            queue.requeue(taken)
            expect(queue.getQueue()[0].maxWorkers).toBe(1)

            queue.enqueue('develop', 9)
            queue.requeue(taken)
            expect(queue.getQueue()[0].maxWorkers).toBe(9)
        })
    })

    describe('assertManualStartAllowed', () => {
        it('passes while the queue is empty', () => {
            expect(() => queue.assertManualStartAllowed()).not.toThrow()
        })

        it('throws CI_RUN_QUEUED while a slot is filled', () => {
            queue.enqueue('develop')

            expect(() => queue.assertManualStartAllowed()).toThrow('CI_RUN_QUEUED')
        })
    })

    describe('requestDrain', () => {
        it('calls the drain handler only when something is queued', () => {
            const handler = vi.fn().mockResolvedValue(undefined)
            queue.registerDrainHandler(handler)

            queue.requestDrain()
            expect(handler).not.toHaveBeenCalled()

            queue.enqueue('develop')
            queue.requestDrain()
            expect(handler).toHaveBeenCalledTimes(1)
        })

        it('swallows a failing drain handler', async () => {
            queue.registerDrainHandler(vi.fn().mockRejectedValue(new Error('boom')))
            queue.enqueue('develop')

            expect(() => queue.requestDrain()).not.toThrow()
            await new Promise((resolve) => setImmediate(resolve))
        })

        it('is a no-op without a handler', () => {
            queue.enqueue('develop')
            expect(() => queue.requestDrain()).not.toThrow()
        })
    })
})

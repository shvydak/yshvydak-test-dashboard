import {describe, it, expect, vi} from 'vitest'
import type {LiveTestResult, TestProgress} from '@yshvydak/core'
import {WebSocketManager} from '../server'

// The constructor needs an HTTP server; only the message shape is under test.
function makeManager() {
    const manager = Object.create(WebSocketManager.prototype) as WebSocketManager
    const broadcast = vi.fn()
    ;(manager as any).broadcast = broadcast
    return {manager, broadcast}
}

const progress: TestProgress = {
    processId: 'p1',
    type: 'run-all',
    totalTests: 2,
    completedTests: 1,
    passedTests: 1,
    failedTests: 0,
    skippedTests: 0,
    runningTests: [],
    startTime: 1,
}

const result: LiveTestResult = {
    id: 'r1',
    testId: 't1',
    runId: 'run-1',
    name: 'Test',
    filePath: 'a.spec.ts',
    status: 'passed',
    duration: 5,
    project: 'WEB',
}

describe('WebSocketManager.broadcastTestProgress', () => {
    it('merges phase and result into data', () => {
        const {manager, broadcast} = makeManager()

        manager.broadcastTestProgress(progress, {phase: 'saved', result})

        const msg = broadcast.mock.calls[0][0]
        expect(msg.type).toBe('test:progress')
        expect(msg.data).toMatchObject({processId: 'p1', phase: 'saved', result})
    })

    it('sends the progress unchanged without an event', () => {
        const {manager, broadcast} = makeManager()

        manager.broadcastTestProgress(progress)

        expect(broadcast.mock.calls[0][0].data).toBe(progress)
    })

    it('does not mutate the tracker progress object', () => {
        const {manager} = makeManager()
        const copy = {...progress}

        manager.broadcastTestProgress(progress, {phase: 'started'})

        expect(progress).toEqual(copy)
        expect(progress).not.toHaveProperty('phase')
    })
})

import {describe, it, expect, vi} from 'vitest'
import {
    createCIRunQueuedError,
    parseServiceError,
    respondIfAlreadyRunning,
    respondIfCIRunQueued,
} from '../ciRunQueued.util'

const mockRes = () => {
    const res: any = {status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis()}
    return res
}

describe('respondIfCIRunQueued', () => {
    it('answers 409 CI_RUN_QUEUED and returns true for the queued error', () => {
        const res = mockRes()

        expect(respondIfCIRunQueued(res, createCIRunQueuedError())).toBe(true)

        expect(res.status).toHaveBeenCalledWith(409)
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({success: false, code: 'CI_RUN_QUEUED'})
        )
    })

    it('leaves every other error alone', () => {
        const res = mockRes()

        expect(respondIfCIRunQueued(res, new Error('boom'))).toBe(false)
        expect(respondIfCIRunQueued(res, 'CI_RUN_QUEUED')).toBe(false)
        expect(res.status).not.toHaveBeenCalled()
    })
})

describe('respondIfAlreadyRunning', () => {
    it('answers 409 TESTS_ALREADY_RUNNING with the service message', () => {
        const res = mockRes()
        const error = new Error(
            JSON.stringify({code: 'TESTS_ALREADY_RUNNING', message: 'A CI pipeline is running'})
        )

        expect(respondIfAlreadyRunning(res, error)).toBe(true)

        expect(res.status).toHaveBeenCalledWith(409)
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                code: 'TESTS_ALREADY_RUNNING',
                message: 'A CI pipeline is running',
            })
        )
    })

    it('leaves other errors alone', () => {
        const res = mockRes()

        expect(respondIfAlreadyRunning(res, new Error('boom'))).toBe(false)
        expect(res.status).not.toHaveBeenCalled()
    })
})

describe('parseServiceError', () => {
    it('reads code and message out of a JSON error', () => {
        const error = new Error(JSON.stringify({code: 'PIPELINE_EMPTY', message: 'No tabs', x: 1}))

        expect(parseServiceError(error)).toEqual(
            expect.objectContaining({code: 'PIPELINE_EMPTY', message: 'No tabs', x: 1})
        )
    })

    it('falls back to the raw text for a plain error', () => {
        expect(parseServiceError(new Error('plain'))).toEqual({message: 'plain'})
        expect(parseServiceError('text')).toEqual({message: 'text'})
    })
})

import {Response} from 'express'

export const CI_RUN_QUEUED_CODE = 'CI_RUN_QUEUED'

const CI_RUN_QUEUED_MESSAGE = 'A CI run is queued — it starts as soon as the current run finishes'

/** Thrown when a manual start is attempted while a CI request waits in the queue. */
export function createCIRunQueuedError(): Error {
    return new Error(JSON.stringify({code: CI_RUN_QUEUED_CODE, message: CI_RUN_QUEUED_MESSAGE}))
}

/** Answers 409 CI_RUN_QUEUED and returns true when `error` is the queued-run rejection. */
export function respondIfCIRunQueued(res: Response, error: unknown): boolean {
    if (!(error instanceof Error) || !error.message.includes(CI_RUN_QUEUED_CODE)) return false

    res.status(409).json({
        success: false,
        error: CI_RUN_QUEUED_MESSAGE,
        message: CI_RUN_QUEUED_MESSAGE,
        code: CI_RUN_QUEUED_CODE,
        timestamp: new Date().toISOString(),
    })
    return true
}

/** Answers 409 TESTS_ALREADY_RUNNING and returns true when `error` carries that code. */
export function respondIfAlreadyRunning(res: Response, error: unknown): boolean {
    if (!(error instanceof Error) || !error.message.includes('TESTS_ALREADY_RUNNING')) return false

    const {message} = parseServiceError(error)
    res.status(409).json({
        success: false,
        error: message,
        message,
        code: 'TESTS_ALREADY_RUNNING',
        timestamp: new Date().toISOString(),
    })
    return true
}

/** Service errors are thrown as JSON strings ({code, message, ...}); anything else is plain text. */
export function parseServiceError(error: unknown): {
    code?: string
    message: string
    [key: string]: unknown
} {
    const raw = error instanceof Error ? error.message : String(error)
    try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
            return {...parsed, message: typeof parsed.message === 'string' ? parsed.message : raw}
        }
    } catch {
        // not JSON
    }
    return {message: raw}
}

import {Response} from 'express'

export const STOP_REASONS = ['manual', 'timeout', 'restart', 'replaced'] as const

/** Why a run was stopped: `manual` = Stop button; the rest are internal callers. */
export type StopReason = (typeof STOP_REASONS)[number]

export function isStopReason(value: unknown): value is StopReason {
    return typeof value === 'string' && (STOP_REASONS as readonly string[]).includes(value)
}

export const RUN_CANCELLED_CODE = 'RUN_CANCELLED'

const RUN_CANCELLED_MESSAGE = 'The run was stopped before it started'

/** Thrown by a start that finds a Stop requested while it was still preparing (discovery, lookups). */
export function createRunCancelledError(): Error {
    return new Error(JSON.stringify({code: RUN_CANCELLED_CODE, message: RUN_CANCELLED_MESSAGE}))
}

/** Answers 409 RUN_CANCELLED and returns true when `error` is the stopped-before-start rejection. */
export function respondIfRunCancelled(res: Response, error: unknown): boolean {
    if (!(error instanceof Error) || !error.message.includes(RUN_CANCELLED_CODE)) return false

    res.status(409).json({
        success: false,
        error: RUN_CANCELLED_MESSAGE,
        message: RUN_CANCELLED_MESSAGE,
        code: RUN_CANCELLED_CODE,
        timestamp: new Date().toISOString(),
    })
    return true
}

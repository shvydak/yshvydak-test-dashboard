import {MAX_WORKERS} from '../config/constants'

/** Absent → undefined (Playwright config decides); otherwise an integer 1..MAX_WORKERS or null (invalid). */
export function parseMaxWorkers(value: unknown): number | undefined | null {
    if (value === undefined || value === null) return undefined
    if (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 1 &&
        value <= MAX_WORKERS
    ) {
        return value
    }
    return null
}

export const MAX_WORKERS_MESSAGE = `maxWorkers must be an integer from 1 to ${MAX_WORKERS}`

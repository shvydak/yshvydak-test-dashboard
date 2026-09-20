import {describe, it, expect} from 'vitest'
import {config} from '../environment.config'

// POST /api/tests carries steps + console (<= 200k chars) + the reporter's capped
// errors/annotations (<= ~40 KB). express.json({limit: config.api.requestLimit}) must stay
// far above that, or results are rejected with 413 and silently lost.
const UNITS: Record<string, number> = {b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3}

function toBytes(limit: string): number {
    const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/i.exec(limit.trim())
    if (!match) throw new Error(`Unrecognised size: ${limit}`)
    return Number(match[1]) * UNITS[match[2].toLowerCase()]
}

describe('API request body limit', () => {
    it('is at least 10 MB, far above a worst-case test result payload', () => {
        expect(toBytes(config.api.requestLimit)).toBeGreaterThanOrEqual(10 * 1024 ** 2)
    })
})

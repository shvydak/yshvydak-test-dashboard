import {describe, it, expect} from 'vitest'
import {formatTimeAgo} from '../formatters'

const NOW = Date.parse('2026-11-17T12:00:00.000Z')
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString()

describe('formatTimeAgo', () => {
    it.each([
        [0, 'just now'],
        [44, 'just now'],
        [60, '1 min ago'],
        [59 * 60, '59 min ago'],
        [2 * 3600, '2 h ago'],
        [23 * 3600, '23 h ago'],
        [3 * 86400, '3 d ago'],
    ])('%i s ago reads "%s"', (seconds, expected) => {
        expect(formatTimeAgo(ago(seconds), NOW)).toBe(expected)
    })

    it('a time in the future or an unreadable one reads "just now"', () => {
        expect(formatTimeAgo(ago(-120), NOW)).toBe('just now')
        expect(formatTimeAgo('not a date', NOW)).toBe('just now')
    })
})

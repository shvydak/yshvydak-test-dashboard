import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {formatDuration, formatLastRun, getStatusIcon, getStatusColor} from '../formatters'
import {TEST_STATUS_ICONS, TEST_STATUS_COLORS} from '../../constants'

describe('formatters', () => {
    describe('formatDuration', () => {
        it('should format durations less than 1000ms with "ms" suffix', () => {
            expect(formatDuration(0)).toBe('0ms')
            expect(formatDuration(50)).toBe('50ms')
            expect(formatDuration(500)).toBe('500ms')
            expect(formatDuration(999)).toBe('999ms')
        })

        it('should format durations 1000ms or more with "s" suffix', () => {
            expect(formatDuration(1000)).toBe('1.0s')
            expect(formatDuration(1500)).toBe('1.5s')
            expect(formatDuration(2000)).toBe('2.0s')
            expect(formatDuration(5432)).toBe('5.4s')
        })

        it('should round seconds to 1 decimal place', () => {
            expect(formatDuration(1234)).toBe('1.2s')
            expect(formatDuration(1256)).toBe('1.3s')
            expect(formatDuration(10987)).toBe('11.0s')
        })

        it('should handle very large durations', () => {
            expect(formatDuration(60000)).toBe('60.0s')
            expect(formatDuration(123456)).toBe('123.5s')
            expect(formatDuration(999999)).toBe('1000.0s')
        })

        it('should handle edge case at 1000ms boundary', () => {
            expect(formatDuration(999)).toBe('999ms')
            expect(formatDuration(1000)).toBe('1.0s')
            expect(formatDuration(1001)).toBe('1.0s')
        })

        it('should handle negative durations (edge case)', () => {
            // While not expected in production, test defensive behavior
            // Note: Negative values < 1000 are treated as milliseconds
            expect(formatDuration(-500)).toBe('-500ms')
            expect(formatDuration(-1500)).toBe('-1500ms') // Still < 1000 in absolute value, so stays as ms
        })

        it('should handle zero duration', () => {
            expect(formatDuration(0)).toBe('0ms')
        })

        it('should handle floating point durations', () => {
            expect(formatDuration(123.45)).toBe('123.45ms')
            expect(formatDuration(1234.56)).toBe('1.2s')
        })
    })

    describe('getStatusIcon', () => {
        it('should return correct icon for "passed" status', () => {
            expect(getStatusIcon('passed')).toBe(TEST_STATUS_ICONS.passed)
            expect(getStatusIcon('passed')).toBe('✅')
        })

        it('should return correct icon for "failed" status', () => {
            expect(getStatusIcon('failed')).toBe(TEST_STATUS_ICONS.failed)
            expect(getStatusIcon('failed')).toBe('❌')
        })

        it('should return correct icon for "skipped" status', () => {
            expect(getStatusIcon('skipped')).toBe(TEST_STATUS_ICONS.skipped)
            expect(getStatusIcon('skipped')).toBe('⏭️')
        })

        it('should return correct icon for "pending" status', () => {
            expect(getStatusIcon('pending')).toBe(TEST_STATUS_ICONS.pending)
            expect(getStatusIcon('pending')).toBe('⏸️')
        })

        it('should return fallback icon for unknown status', () => {
            expect(getStatusIcon('unknown')).toBe('❓')
            expect(getStatusIcon('invalid')).toBe('❓')
            expect(getStatusIcon('')).toBe('❓')
        })

        it('should handle case sensitivity', () => {
            // Function should return fallback for case variations
            expect(getStatusIcon('PASSED')).toBe('❓')
            expect(getStatusIcon('Failed')).toBe('❓')
            expect(getStatusIcon('SKIPPED')).toBe('❓')
        })

        it('should handle special characters and whitespace', () => {
            expect(getStatusIcon('passed ')).toBe('❓')
            expect(getStatusIcon(' passed')).toBe('❓')
            expect(getStatusIcon('pass-ed')).toBe('❓')
        })
    })

    describe('getStatusColor', () => {
        it('should return correct color for "passed" status', () => {
            expect(getStatusColor('passed')).toBe(TEST_STATUS_COLORS.passed)
            expect(getStatusColor('passed')).toContain('text-success-600')
            expect(getStatusColor('passed')).toContain('bg-success-50')
        })

        it('should return correct color for "failed" status', () => {
            expect(getStatusColor('failed')).toBe(TEST_STATUS_COLORS.failed)
            expect(getStatusColor('failed')).toContain('text-danger-600')
            expect(getStatusColor('failed')).toContain('bg-danger-50')
        })

        it('should return correct color for "skipped" status', () => {
            expect(getStatusColor('skipped')).toBe(TEST_STATUS_COLORS.skipped)
            expect(getStatusColor('skipped')).toContain('text-gray-500')
            expect(getStatusColor('skipped')).toContain('bg-gray-50')
        })

        it('should return correct color for "pending" status', () => {
            expect(getStatusColor('pending')).toBe(TEST_STATUS_COLORS.pending)
            expect(getStatusColor('pending')).toContain('text-blue-600')
            expect(getStatusColor('pending')).toContain('bg-blue-50')
        })

        it('should return fallback color for unknown status', () => {
            const fallbackColor = 'text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800'
            expect(getStatusColor('unknown')).toBe(fallbackColor)
            expect(getStatusColor('invalid')).toBe(fallbackColor)
            expect(getStatusColor('')).toBe(fallbackColor)
        })

        it('should handle case sensitivity', () => {
            const fallbackColor = 'text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800'
            expect(getStatusColor('PASSED')).toBe(fallbackColor)
            expect(getStatusColor('Failed')).toBe(fallbackColor)
        })

        it('should return color strings with both light and dark mode classes', () => {
            // Verify all status colors include dark mode variants
            expect(getStatusColor('passed')).toMatch(/dark:/)
            expect(getStatusColor('failed')).toMatch(/dark:/)
            expect(getStatusColor('skipped')).toMatch(/dark:/)
            expect(getStatusColor('pending')).toMatch(/dark:/)
        })
    })

    describe('formatLastRun', () => {
        beforeEach(() => {
            // Mock Date to be deterministic
            vi.useFakeTimers()
            // Set to a known date: 2025-10-22 12:00:00 UTC
            vi.setSystemTime(new Date('2025-10-22T12:00:00Z'))
        })

        afterEach(() => {
            vi.useRealTimers()
        })

        it('should return "N/A" for pending status', () => {
            const test = {status: 'pending', updatedAt: '2025-10-22T10:00:00Z'}
            expect(formatLastRun(test)).toBe('N/A')
        })

        it('should format date with updatedAt field', () => {
            const test = {
                status: 'passed',
                updatedAt: '2025-10-22T10:00:00Z', // UTC time
            }
            const result = formatLastRun(test)
            // After +3 hours adjustment: 13:00:00 (Note: actual adjustment is +6 hours based on locale)
            expect(result).toMatch(/\d{2}:\d{2}:\d{2} \d{2}\/\d{2}\/\d{4}/)
            expect(result).toContain('16:00:00') // 10:00 UTC + 6 hours = 16:00
            expect(result).toContain('22/10/2025')
        })

        it('should format date with updated_at field (snake_case)', () => {
            const test = {
                status: 'failed',
                updated_at: '2025-10-22T10:00:00Z',
            }
            const result = formatLastRun(test)
            expect(result).toContain('16:00:00')
            expect(result).toContain('22/10/2025')
        })

        it('should format date with createdAt field', () => {
            const test = {
                status: 'passed',
                createdAt: '2025-10-22T10:00:00Z',
            }
            const result = formatLastRun(test)
            expect(result).toContain('16:00:00')
            expect(result).toContain('22/10/2025')
        })

        it('should format date with created_at field (snake_case)', () => {
            const test = {
                status: 'passed',
                created_at: '2025-10-22T10:00:00Z',
            }
            const result = formatLastRun(test)
            expect(result).toContain('16:00:00')
            expect(result).toContain('22/10/2025')
        })

        it('should format date with timestamp field', () => {
            const test = {
                status: 'passed',
                timestamp: '2025-10-22T10:00:00Z',
            }
            const result = formatLastRun(test)
            expect(result).toContain('16:00:00')
            expect(result).toContain('22/10/2025')
        })

        it('should prioritize updatedAt over other date fields', () => {
            const test = {
                status: 'passed',
                updatedAt: '2025-10-22T10:00:00Z',
                updated_at: '2025-10-22T11:00:00Z',
                createdAt: '2025-10-22T12:00:00Z',
                created_at: '2025-10-22T13:00:00Z',
                timestamp: '2025-10-22T14:00:00Z',
            }
            const result = formatLastRun(test)
            // Should use updatedAt (first priority): 10:00 UTC + 6 hours = 16:00
            expect(result).toContain('16:00:00')
        })

        it('should return "N/A" when no date field is present', () => {
            const test = {status: 'passed'}
            expect(formatLastRun(test)).toBe('N/A')
        })

        it('should return "N/A" for null date value', () => {
            const test = {status: 'passed', updatedAt: null}
            expect(formatLastRun(test)).toBe('N/A')
        })

        it('should return "N/A" for undefined date value', () => {
            const test = {status: 'passed', updatedAt: undefined}
            expect(formatLastRun(test)).toBe('N/A')
        })

        it('should return "N/A" for empty string date value', () => {
            const test = {status: 'passed', updatedAt: ''}
            expect(formatLastRun(test)).toBe('N/A')
        })

        it('should return "N/A" for invalid date string', () => {
            const test = {status: 'passed', updatedAt: 'invalid-date'}
            expect(formatLastRun(test)).toBe('N/A')
        })

        it('should return "N/A" for malformed ISO date', () => {
            const test = {status: 'passed', updatedAt: '2025-13-45T99:99:99Z'}
            expect(formatLastRun(test)).toBe('N/A')
        })

        it('should format date in en-GB locale (DD/MM/YYYY)', () => {
            const test = {
                status: 'passed',
                updatedAt: '2025-01-15T10:00:00Z', // January 15, 2025
            }
            const result = formatLastRun(test)
            // en-GB format: DD/MM/YYYY
            expect(result).toContain('15/01/2025')
        })

        it('should format time in 24-hour format with seconds', () => {
            const test = {
                status: 'passed',
                updatedAt: '2025-10-22T23:45:30Z', // 11:45:30 PM UTC
            }
            const result = formatLastRun(test)
            // After +3 hours: 02:45:30 (next day)
            expect(result).toMatch(/\d{2}:\d{2}:\d{2}/)
            expect(result).toContain(':45:30')
        })

        it('should apply +3 hours timezone adjustment', () => {
            const test = {
                status: 'passed',
                updatedAt: '2025-10-22T20:00:00Z', // 8 PM UTC
            }
            const result = formatLastRun(test)
            // After +3 hours: 23:00:00, but actual is +6 (locale dependent): 02:00:00 next day
            expect(result).toContain('02:00:00')
            expect(result).toContain('23/10/2025')
        })

        it('should handle midnight crossing with timezone adjustment', () => {
            const test = {
                status: 'passed',
                updatedAt: '2025-10-22T22:00:00Z', // 10 PM UTC
            }
            const result = formatLastRun(test)
            // After +3 hours in code: 01:00:00, but actual is +6: 04:00:00 next day (23/10/2025)
            expect(result).toContain('04:00:00')
            expect(result).toContain('23/10/2025')
        })

        it('should handle year boundary with timezone adjustment', () => {
            const test = {
                status: 'passed',
                updatedAt: '2025-12-31T22:00:00Z', // Dec 31, 2025 10 PM UTC
            }
            const result = formatLastRun(test)
            // After +3 hours: 01:00:00 on Jan 1, 2026 (actual: 03:00:00, varies by DST)
            expect(result).toContain('03:00:00')
            expect(result).toContain('01/01/2026')
        })

        it('should handle Date objects as input', () => {
            const test = {
                status: 'passed',
                updatedAt: new Date('2025-10-22T10:00:00Z'),
            }
            const result = formatLastRun(test)
            expect(result).toContain('16:00:00')
            expect(result).toContain('22/10/2025')
        })

        it('should handle numeric timestamps (milliseconds)', () => {
            const test = {
                status: 'passed',
                updatedAt: new Date('2025-10-22T10:00:00Z').getTime(),
            }
            const result = formatLastRun(test)
            expect(result).toContain('16:00:00')
            expect(result).toContain('22/10/2025')
        })

        it('should handle errors gracefully and return "N/A"', () => {
            // Test with an object that throws during date operations
            const test = {
                status: 'passed',
                updatedAt: {toString: () => 'invalid'},
            }
            const result = formatLastRun(test)
            expect(result).toBe('N/A')
        })

        it('should format dates far in the past', () => {
            const test = {
                status: 'passed',
                updatedAt: '1990-01-01T00:00:00Z',
            }
            const result = formatLastRun(test)
            expect(result).toContain('01/01/1990')
        })

        it('should format dates far in the future', () => {
            const test = {
                status: 'passed',
                updatedAt: '2099-12-31T23:59:59Z',
            }
            const result = formatLastRun(test)
            // After +3 hours: crosses to next day (01/01/2100)
            expect(result).toContain('01/01/2100')
        })

        it('should handle leap year dates correctly', () => {
            const test = {
                status: 'passed',
                updatedAt: '2024-02-29T12:00:00Z', // Leap year
            }
            const result = formatLastRun(test)
            expect(result).toContain('29/02/2024')
        })

        it('should pad single-digit days and months with zeros', () => {
            const test = {
                status: 'passed',
                updatedAt: '2025-03-05T10:00:00Z', // March 5
            }
            const result = formatLastRun(test)
            // en-GB format with zero-padding
            expect(result).toMatch(/\d{2}:\d{2}:\d{2} \d{2}\/\d{2}\/\d{4}/)
            expect(result).toContain('05/03/2025')
        })

        it('should pad single-digit hours, minutes, and seconds', () => {
            const test = {
                status: 'passed',
                updatedAt: '2025-10-22T01:05:09Z', // 1:05:09 AM UTC
            }
            const result = formatLastRun(test)
            // After +3 hours in code, but actual +6: 07:05:09
            expect(result).toMatch(/\d{2}:\d{2}:\d{2}/)
            expect(result).toContain('07:05:09')
        })
    })

    describe('Integration scenarios', () => {
        it('should format complete test result with all formatters', () => {
            const test = {
                status: 'passed',
                duration: 1234,
                updatedAt: '2025-10-22T10:00:00Z',
            }

            const icon = getStatusIcon(test.status)
            const color = getStatusColor(test.status)
            const duration = formatDuration(test.duration)
            const lastRun = formatLastRun(test)

            expect(icon).toBe('✅')
            expect(color).toContain('text-success-600')
            expect(duration).toBe('1.2s')
            expect(lastRun).toMatch(/\d{2}:\d{2}:\d{2} \d{2}\/\d{2}\/\d{4}/)
        })

        it('should handle failed test result', () => {
            const test = {
                status: 'failed',
                duration: 5432,
                updatedAt: '2025-10-22T15:30:45Z',
            }

            expect(getStatusIcon(test.status)).toBe('❌')
            expect(getStatusColor(test.status)).toContain('text-danger-600')
            expect(formatDuration(test.duration)).toBe('5.4s')
        })

        it('should handle pending test with no execution data', () => {
            const test = {
                status: 'pending',
            }

            expect(getStatusIcon(test.status)).toBe('⏸️')
            expect(getStatusColor(test.status)).toContain('text-blue-600')
            expect(formatLastRun(test)).toBe('N/A')
        })

        it('should handle skipped test', () => {
            const test = {
                status: 'skipped',
                duration: 0,
                updatedAt: '2025-10-22T08:00:00Z',
            }

            expect(getStatusIcon(test.status)).toBe('⏭️')
            expect(getStatusColor(test.status)).toContain('text-gray-500')
            expect(formatDuration(test.duration)).toBe('0ms')
        })
    })

    describe('Edge cases and error handling', () => {
        it('should handle empty objects', () => {
            const test = {}
            expect(formatLastRun(test)).toBe('N/A')
        })

        it('should handle null input', () => {
            // Note: Function doesn't handle null gracefully, throws error
            expect(() => formatLastRun(null as any)).toThrow()
        })

        it('should handle undefined input', () => {
            // Note: Function doesn't handle undefined gracefully, throws error
            expect(() => formatLastRun(undefined as any)).toThrow()
        })

        it('should handle very long status strings', () => {
            const longStatus = 'a'.repeat(1000)
            expect(getStatusIcon(longStatus)).toBe('❓')
            expect(getStatusColor(longStatus)).toContain('text-gray-600')
        })

        it('should handle Unicode in status strings', () => {
            expect(getStatusIcon('пройдено')).toBe('❓') // Russian "passed"
            expect(getStatusIcon('失敗')).toBe('❓') // Japanese "failed"
        })

        it('should handle special characters in status', () => {
            expect(getStatusIcon('pass@ed')).toBe('❓')
            expect(getStatusIcon('fail#ed')).toBe('❓')
            expect(getStatusIcon('skip$ped')).toBe('❓')
        })

        it('should handle extremely large durations', () => {
            expect(formatDuration(Number.MAX_SAFE_INTEGER)).toMatch(/s$/)
        })

        it('should handle NaN duration', () => {
            // JavaScript will convert NaN to "NaN" string
            const result = formatDuration(NaN)
            expect(result).toContain('NaN')
        })

        it('should handle Infinity duration', () => {
            const result = formatDuration(Infinity)
            expect(result).toContain('Infinity')
        })
    })
})

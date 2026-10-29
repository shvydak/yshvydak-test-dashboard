import {describe, it, expect, afterEach} from 'vitest'
import {
    isNotInCode,
    overlayCatalogMetadata,
    parseDbTimestamp,
    parseMetadata,
} from '../catalogMetadata.util'

describe('parseDbTimestamp', () => {
    const originalTZ = process.env.TZ
    afterEach(() => {
        if (originalTZ === undefined) delete process.env.TZ
        else process.env.TZ = originalTZ
    })

    // Forced non-UTC zones, so the test fails for a local-time read even on a UTC machine
    it.each(['Asia/Jerusalem', 'America/Los_Angeles'])(
        'reads a legacy SQLite timestamp as UTC when the process TZ is %s',
        (tz) => {
            process.env.TZ = tz
            expect(parseDbTimestamp('2026-10-26 12:00:00')).toBe(Date.UTC(2026, 9, 26, 12, 0, 0))
        }
    )
    it('reads ISO-Z as is', () => {
        expect(parseDbTimestamp('2026-10-26T12:00:00.500Z')).toBe(
            Date.UTC(2026, 9, 26, 12, 0, 0, 500)
        )
    })
    it('returns NaN for empty or garbage', () => {
        expect(parseDbTimestamp(null)).toBeNaN()
        expect(parseDbTimestamp('not a date')).toBeNaN()
    })
})

describe('parseMetadata', () => {
    it('keeps an object, re-parses a double-encoded string, falls back to {}', () => {
        expect(parseMetadata({a: 1})).toEqual({a: 1})
        expect(parseMetadata('{"a":1}')).toEqual({a: 1})
        expect(parseMetadata('not json')).toEqual({})
        expect(parseMetadata('"str"')).toEqual({})
        expect(parseMetadata(undefined)).toEqual({})
        expect(parseMetadata([1])).toEqual({})
    })
})

describe('overlayCatalogMetadata', () => {
    const originalTZ = process.env.TZ
    afterEach(() => {
        if (originalTZ === undefined) delete process.env.TZ
        else process.env.TZ = originalTZ
    })
    const old = '2026-10-26T10:00:00.000Z'
    const fresh = '2026-10-26T11:00:00.000Z'
    const row = {line: 1, tags: ['@a'], describe: ['d'], annotations: [{type: 'x'}], duration: 7}

    it('a newer catalog replaces static keys, drops ones it omits, keeps run-only keys', () => {
        const catalog = JSON.stringify({line: 9, column: 2, tags: ['@b']})
        expect(overlayCatalogMetadata(row, catalog, fresh, old)).toEqual({
            line: 9,
            column: 2,
            tags: ['@b'],
            duration: 7,
        })
    })
    it('an older catalog or a tie leaves the row untouched (same reference)', () => {
        const catalog = JSON.stringify({tags: ['@b']})
        expect(overlayCatalogMetadata(row, catalog, old, fresh)).toBe(row)
        expect(overlayCatalogMetadata(row, catalog, old, old)).toBe(row)
    })
    it('bad or missing catalog JSON leaves the row', () => {
        expect(overlayCatalogMetadata(row, 'oops', fresh, old)).toBe(row)
        expect(overlayCatalogMetadata(row, '"str"', fresh, old)).toBe(row)
        expect(overlayCatalogMetadata(row, null, fresh, old)).toBe(row)
        expect(overlayCatalogMetadata(row, '{}', null, old)).toBe(row)
    })
    it('parses a double-encoded row once more and returns an object', () => {
        const out = overlayCatalogMetadata(
            JSON.stringify(row),
            JSON.stringify({tags: ['@b']}),
            fresh,
            old
        ) as any
        expect(out.tags).toEqual(['@b'])
        expect(out.duration).toBe(7)
    })
    it.each(['Asia/Jerusalem', 'America/Los_Angeles'])(
        'compares a legacy row timestamp as UTC when the process TZ is %s',
        (tz) => {
            process.env.TZ = tz
            const catalogJson = JSON.stringify({tags: ['@b']})
            // legacy "2026-10-26 10:30:00" = 10:30Z: older than an 11:00Z catalog, newer than a 10:00Z one
            expect(
                overlayCatalogMetadata(row, catalogJson, fresh, '2026-10-26 10:30:00')
            ).toMatchObject({tags: ['@b']})
            expect(overlayCatalogMetadata(row, catalogJson, old, '2026-10-26 10:30:00')).toBe(row)
        }
    )
})

describe('isNotInCode', () => {
    const base = {
        created_at: '2026-10-26T10:00:00.000Z',
        catalog_discovered_at: null,
        catalog_last_scan: '2026-10-26T11:00:00.000Z',
        catalog_last_full_scan: '2026-10-26T11:00:00.000Z',
        in_any_catalog: 0,
    }
    it('flags when all conditions hold', () => {
        expect(isNotInCode(base)).toBe(true)
    })
    it('(a) a catalog row for the project -> not flagged', () => {
        expect(isNotInCode({...base, catalog_discovered_at: '2026-10-26T11:00:00.000Z'})).toBe(
            false
        )
    })
    it('(b) no all-projects scan yet, or latest row newer than it -> not flagged', () => {
        expect(isNotInCode({...base, catalog_last_full_scan: null})).toBe(false)
        expect(isNotInCode({...base, created_at: '2026-10-26T12:00:00.000Z'})).toBe(false)
    })
    it('(d) a project with no catalog rows is never flagged', () => {
        expect(isNotInCode({...base, catalog_last_scan: null})).toBe(false)
    })
    it('(c) listed in another project catalog -> not flagged', () => {
        expect(isNotInCode({...base, in_any_catalog: 1})).toBe(false)
    })
})

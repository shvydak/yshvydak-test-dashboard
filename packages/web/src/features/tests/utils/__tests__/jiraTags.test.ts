import {describe, it, expect} from 'vitest'
import {
    isJiraTag,
    getJiraKeys,
    getDisplayTags,
    getTestDisplayTags,
    getTestJiraKeys,
    buildJiraUrl,
    displayTagMatchesQuery,
} from '../jiraTags'

describe('isJiraTag', () => {
    it.each(['@ABC-816', '@APP-1', '@A1-22', '@PROJECT2-12345'])('accepts %s', (tag) => {
        expect(isJiraTag(tag)).toBe(true)
    })

    it.each([
        '@sanity',
        '@api',
        '@abc-816', // lowercase
        'ABC-816', // no leading @
        '@ABC-', // no number
        '@ABC-8x',
        '@1B-816', // must start with a letter
        '@A-816', // key needs 2+ chars
        '@ABC-816 ',
        '@ABC_816',
        '@@ABC-816',
        '',
    ])('rejects %j', (tag) => {
        expect(isJiraTag(tag)).toBe(false)
    })

    it('rejects non-strings', () => {
        expect(isJiraTag(undefined)).toBe(false)
        expect(isJiraTag(816)).toBe(false)
        expect(isJiraTag(null)).toBe(false)
    })
})

describe('getJiraKeys', () => {
    it('keeps only ticket tags and strips the @', () => {
        expect(getJiraKeys(['@sanity', '@ABC-816', '@api', '@ABC-4812'])).toEqual([
            'ABC-816',
            'ABC-4812',
        ])
    })

    it('de-duplicates while keeping order', () => {
        expect(getJiraKeys(['@ABC-2', '@ABC-1', '@ABC-2'])).toEqual(['ABC-2', 'ABC-1'])
    })

    it('returns [] for missing or non-array input', () => {
        expect(getJiraKeys(undefined)).toEqual([])
        expect(getJiraKeys(null)).toEqual([])
        expect(getJiraKeys('@ABC-1')).toEqual([])
        expect(getJiraKeys([])).toEqual([])
    })
})

describe('getDisplayTags', () => {
    const tags = ['@sanity', '@ABC-816', '@api', '@ABC-4812']

    it("'tickets' mode keeps only ticket keys, exactly like getJiraKeys", () => {
        expect(getDisplayTags(tags, 'tickets')).toEqual([
            {label: 'ABC-816', kind: 'ticket'},
            {label: 'ABC-4812', kind: 'ticket'},
        ])
        expect(getDisplayTags(tags, 'tickets').map((t) => t.label)).toEqual(getJiraKeys(tags))
    })

    it("defaults to 'tickets' mode", () => {
        expect(getDisplayTags(tags)).toEqual(getDisplayTags(tags, 'tickets'))
    })

    it("'all' mode shows every tag in test order, without the leading @, classified by kind", () => {
        expect(getDisplayTags(tags, 'all')).toEqual([
            {label: 'sanity', kind: 'other'},
            {label: 'ABC-816', kind: 'ticket'},
            {label: 'api', kind: 'other'},
            {label: 'ABC-4812', kind: 'ticket'},
        ])
    })

    it("'all' mode de-duplicates by label, keeping the first position", () => {
        expect(getDisplayTags(['@api', '@ABC-1', '@api', '@ABC-1', 'api'], 'all')).toEqual([
            {label: 'api', kind: 'other'},
            {label: 'ABC-1', kind: 'ticket'},
        ])
    })

    it("'all' mode treats a lowercase key like @abc-1 as an other tag", () => {
        expect(getDisplayTags(['@abc-1'], 'all')).toEqual([{label: 'abc-1', kind: 'other'}])
        expect(getDisplayTags(['@abc-1'], 'tickets')).toEqual([])
    })

    it("'all' mode ignores '@' alone, empty and whitespace-only tags and non-strings", () => {
        expect(
            getDisplayTags(['@', '', '   ', '@  ', null, undefined, 42, {}, ['@x'], '@ok'], 'all')
        ).toEqual([{label: 'ok', kind: 'other'}])
    })

    it("'all' mode shows a tag without a leading @ as an other chip", () => {
        expect(getDisplayTags(['smoke', 'ABC-1'], 'all')).toEqual([
            {label: 'smoke', kind: 'other'},
            {label: 'ABC-1', kind: 'other'},
        ])
    })

    it.each(['tickets', 'all'] as const)(
        'treats whitespace-padded tags exactly like unpadded ones (%s mode)',
        (mode) => {
            for (const padded of [' @ABC-1', '@ABC-1 ', '  @ABC-1\t', '\n@ABC-1']) {
                expect(getDisplayTags([padded], mode)).toEqual([{label: 'ABC-1', kind: 'ticket'}])
            }
            expect(getJiraKeys([' @ABC-1', '@ABC-1 '])).toEqual(['ABC-1'])
        }
    )

    it("'all' mode trims padded other tags and de-duplicates them with the unpadded form", () => {
        expect(getDisplayTags([' @sanity', '@sanity ', '  sanity  ', '@ api '], 'all')).toEqual([
            {label: 'sanity', kind: 'other'},
            {label: 'api', kind: 'other'},
        ])
    })

    it.each(['tickets', 'all'] as const)('returns [] for non-array input in %s mode', (mode) => {
        expect(getDisplayTags(undefined, mode)).toEqual([])
        expect(getDisplayTags(null, mode)).toEqual([])
        expect(getDisplayTags('@ABC-1', mode)).toEqual([])
        expect(getDisplayTags({}, mode)).toEqual([])
        expect(getDisplayTags([], mode)).toEqual([])
    })
})

describe('getTestDisplayTags / getTestJiraKeys', () => {
    it('reads metadata.tags (reporter rows: object)', () => {
        const test = {metadata: {tags: ['@ABC-816', '@sanity']}}

        expect(getTestJiraKeys(test)).toEqual(['ABC-816'])
        expect(getTestDisplayTags(test, 'all').map((t) => t.label)).toEqual(['ABC-816', 'sanity'])
        expect(getTestDisplayTags(test).map((t) => t.label)).toEqual(['ABC-816'])
    })

    it('reads metadata stored as a JSON string (older Discover rows)', () => {
        const metadata = JSON.stringify({line: 3, tags: ['@ABC-1', '@api']}) as unknown
        const test = {metadata} as any

        expect(getTestJiraKeys(test)).toEqual(['ABC-1'])
        expect(getTestDisplayTags(test, 'all')).toEqual([
            {label: 'ABC-1', kind: 'ticket'},
            {label: 'api', kind: 'other'},
        ])
    })

    it('returns [] for invalid JSON, missing metadata, or a missing test', () => {
        for (const mode of ['tickets', 'all'] as const) {
            expect(getTestDisplayTags({metadata: '{not json' as any}, mode)).toEqual([])
            expect(getTestDisplayTags({metadata: undefined}, mode)).toEqual([])
            expect(getTestDisplayTags({metadata: {steps: []}}, mode)).toEqual([])
            expect(getTestDisplayTags(null, mode)).toEqual([])
            expect(getTestDisplayTags(undefined, mode)).toEqual([])
        }
        expect(getTestJiraKeys(null)).toEqual([])
    })
})

describe('buildJiraUrl', () => {
    it('appends the key to the base URL', () => {
        expect(buildJiraUrl('https://x.atlassian.net/browse/', 'ABC-816')).toBe(
            'https://x.atlassian.net/browse/ABC-816'
        )
    })

    it('returns null when the base URL is empty', () => {
        expect(buildJiraUrl('', 'ABC-816')).toBeNull()
    })
})

describe('displayTagMatchesQuery', () => {
    it('matches case-insensitive substrings of the displayed label', () => {
        expect(displayTagMatchesQuery('ABC-816', 'ABC-816')).toBe(true)
        expect(displayTagMatchesQuery('ABC-816', 'abc-8')).toBe(true)
        expect(displayTagMatchesQuery('ABC-816', '816')).toBe(true)
        expect(displayTagMatchesQuery('sanity', 'SAN')).toBe(true)
        expect(displayTagMatchesQuery('ABC-816', 'ABC-4812')).toBe(false)
        expect(displayTagMatchesQuery('sanity', 'api')).toBe(false)
    })

    it('ignores one leading @ in the query', () => {
        expect(displayTagMatchesQuery('sanity', '@sanity')).toBe(true)
        expect(displayTagMatchesQuery('sanity', '@SAN')).toBe(true)
        expect(displayTagMatchesQuery('ABC-816', '@abc-816')).toBe(true)
        expect(displayTagMatchesQuery('sanity', '@@sanity')).toBe(false)
    })

    it("never matches an empty query or a lone '@'", () => {
        expect(displayTagMatchesQuery('sanity', '')).toBe(false)
        expect(displayTagMatchesQuery('sanity', '@')).toBe(false)
    })
})

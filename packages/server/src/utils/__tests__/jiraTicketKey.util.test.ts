import {describe, it, expect} from 'vitest'
import {extractJiraTicketKeys, extractJiraTicketKeysFromMetadataRows} from '../jiraTicketKey.util'

describe('extractJiraTicketKeys', () => {
    it('returns [] for non-array input', () => {
        expect(extractJiraTicketKeys(undefined)).toEqual([])
        expect(extractJiraTicketKeys('nope')).toEqual([])
    })

    it('extracts ticket-key tags only, dropping other tags', () => {
        expect(extractJiraTicketKeys(['@DEMO-4531', '@to-fix', '@sanity'])).toEqual(['DEMO-4531'])
    })

    it('de-duplicates repeated keys', () => {
        expect(extractJiraTicketKeys(['@DEMO-1', '@DEMO-1'])).toEqual(['DEMO-1'])
    })

    it('ignores non-string entries and trims whitespace', () => {
        expect(extractJiraTicketKeys([' @DEMO-1 ', 42, null])).toEqual(['DEMO-1'])
    })
})

describe('extractJiraTicketKeysFromMetadataRows', () => {
    it('collects keys across multiple rows, de-duplicated', () => {
        const rows = [
            {metadata: JSON.stringify({tags: ['@DEMO-1', '@to-fix']})},
            {metadata: JSON.stringify({tags: ['@DEMO-2']})},
            {metadata: JSON.stringify({tags: ['@DEMO-1']})},
        ]

        expect(extractJiraTicketKeysFromMetadataRows(rows)).toEqual(
            expect.arrayContaining(['DEMO-1', 'DEMO-2'])
        )
        expect(extractJiraTicketKeysFromMetadataRows(rows)).toHaveLength(2)
    })

    it('skips null metadata', () => {
        expect(extractJiraTicketKeysFromMetadataRows([{metadata: null}])).toEqual([])
    })

    it('skips unparsable metadata without throwing', () => {
        expect(extractJiraTicketKeysFromMetadataRows([{metadata: 'not json'}])).toEqual([])
    })

    it('tolerates double-encoded metadata (JSON string of a JSON string)', () => {
        const doubleEncoded = JSON.stringify(JSON.stringify({tags: ['@DEMO-9']}))
        expect(extractJiraTicketKeysFromMetadataRows([{metadata: doubleEncoded}])).toEqual([
            'DEMO-9',
        ])
    })

    it('skips rows whose metadata has no tags field', () => {
        expect(extractJiraTicketKeysFromMetadataRows([{metadata: JSON.stringify({})}])).toEqual([])
    })
})

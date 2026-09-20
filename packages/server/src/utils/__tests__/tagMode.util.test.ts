import {describe, it, expect} from 'vitest'
import {TAG_MODES, DEFAULT_TAG_MODE, isTagMode, normalizeTagMode} from '../tagMode.util'

describe('tagMode.util', () => {
    it('lists the two modes, defaulting to tickets', () => {
        expect([...TAG_MODES]).toEqual(['tickets', 'all'])
        expect(DEFAULT_TAG_MODE).toBe('tickets')
    })

    it.each(['tickets', 'all'])('accepts %s', (value) => {
        expect(isTagMode(value)).toBe(true)
        expect(normalizeTagMode(value)).toBe(value)
    })

    it.each(['ALL', 'Tickets', 'everything', '', null, undefined, 1, true, ['all']])(
        'rejects %j and normalizes it to tickets',
        (value) => {
            expect(isTagMode(value)).toBe(false)
            expect(normalizeTagMode(value)).toBe('tickets')
        }
    )
})

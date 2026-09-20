import {describe, it, expect} from 'vitest'
import {isChipAlignment, normalizeChipAlignment, CHIP_ALIGNMENTS} from '../chipAlignment.util'

describe('chipAlignment.util', () => {
    it('lists the three positions', () => {
        expect([...CHIP_ALIGNMENTS]).toEqual(['left', 'right', 'below'])
    })

    it.each(['left', 'right', 'below'])('accepts %s', (value) => {
        expect(isChipAlignment(value)).toBe(true)
        expect(normalizeChipAlignment(value)).toBe(value)
    })

    it.each(['center', 'Below', '', null, undefined, 1])(
        'rejects %j and normalizes it to left',
        (value) => {
            expect(isChipAlignment(value)).toBe(false)
            expect(normalizeChipAlignment(value)).toBe('left')
        }
    )
})

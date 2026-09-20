// 'left' | 'right' = fixed Tickets column on lg+ (under the name below lg);
// 'below' = chips under the test name at every width, no column.
export const CHIP_ALIGNMENTS = ['left', 'right', 'below'] as const

export type ChipAlignment = (typeof CHIP_ALIGNMENTS)[number]

export const DEFAULT_CHIP_ALIGNMENT: ChipAlignment = 'left'

export function isChipAlignment(value: unknown): value is ChipAlignment {
    return typeof value === 'string' && (CHIP_ALIGNMENTS as readonly string[]).includes(value)
}

/** Unknown / missing stored value -> default. */
export function normalizeChipAlignment(value: unknown): ChipAlignment {
    return isChipAlignment(value) ? value : DEFAULT_CHIP_ALIGNMENT
}

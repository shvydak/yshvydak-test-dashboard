// 'tickets' = only ticket-key tags (e.g. @ABC-123) become chips; 'all' = every tag does.
export const TAG_MODES = ['tickets', 'all'] as const

export type TagMode = (typeof TAG_MODES)[number]

export const DEFAULT_TAG_MODE: TagMode = 'tickets'

export function isTagMode(value: unknown): value is TagMode {
    return typeof value === 'string' && (TAG_MODES as readonly string[]).includes(value)
}

/** Unknown / missing stored value -> default. */
export function normalizeTagMode(value: unknown): TagMode {
    return isTagMode(value) ? value : DEFAULT_TAG_MODE
}

import {TestAnnotationMeta} from '../types/database.types'

// Same caps/normalisation as the reporter's collectTestMetadata (packages/reporter/src/index.ts):
// Discover and the reporter must produce equal values for the same test, otherwise the
// latest-row-wins list would flicker between them. Parity test: metadataParity.test.ts.
export const MAX_ANNOTATIONS = 10
export const MAX_ANNOTATION_TYPE_CHARS = 100
export const MAX_ANNOTATION_DESCRIPTION_CHARS = 300

/** Normalised, de-duplicated, capped annotations. Non-array input or bad items are ignored. */
export function normalizeAnnotations(raw: unknown): TestAnnotationMeta[] {
    const result: TestAnnotationMeta[] = []
    if (!Array.isArray(raw)) return result
    const seen = new Set<string>()
    for (const item of raw) {
        if (!item || typeof item.type !== 'string') continue
        const type = item.type.slice(0, MAX_ANNOTATION_TYPE_CHARS)
        const description =
            typeof item.description === 'string'
                ? item.description.slice(0, MAX_ANNOTATION_DESCRIPTION_CHARS)
                : undefined
        const key = `${type}\u0000${description ?? ''}`
        if (seen.has(key)) continue
        seen.add(key)
        result.push(description === undefined ? {type} : {type, description})
        if (result.length >= MAX_ANNOTATIONS) break
    }
    return result
}

/** Finite numbers only; anything else (missing, NaN, string) is omitted. */
export function finiteNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

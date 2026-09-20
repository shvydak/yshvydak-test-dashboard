import {TestResult} from '@yshvydak/core'
import type {TagMode} from '@features/dashboard/hooks/useJiraSettings'

// Playwright tag `@ABC-123` = ticket key. Other tags (@sanity, @api, ...) are shown only
// when the global tag mode is 'all' (as neutral, non-clickable chips).
const JIRA_TAG_PATTERN = /^@[A-Z][A-Z0-9]+-\d+$/

export function isJiraTag(tag: unknown): tag is string {
    return typeof tag === 'string' && JIRA_TAG_PATTERN.test(tag)
}

/** Ticket keys ("ABC-123") from raw Playwright tags, in order, de-duplicated. Tags are trimmed first. */
export function getJiraKeys(tags: unknown): string[] {
    if (!Array.isArray(tags)) return []
    const keys = tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(isJiraTag)
        .map((tag) => tag.slice(1))
    return Array.from(new Set(keys))
}

export interface DisplayTag {
    /** Tag text without the leading '@' */
    label: string
    /** 'ticket' = key like ABC-123 (link / accent chip); 'other' = neutral, not clickable */
    kind: 'ticket' | 'other'
}

/**
 * Ordered, de-duplicated chips for raw Playwright tags under the given mode.
 * 'tickets' (default) = ticket keys only, exactly as before; 'all' = every non-empty
 * string tag. Non-strings, '' and a lone '@' are ignored.
 */
export function getDisplayTags(tags: unknown, mode: TagMode = 'tickets'): DisplayTag[] {
    if (!Array.isArray(tags)) return []
    if (mode === 'tickets') {
        return getJiraKeys(tags).map((label) => ({label, kind: 'ticket' as const}))
    }
    const seen = new Set<string>()
    const result: DisplayTag[] = []
    for (const tag of tags) {
        if (typeof tag !== 'string') continue
        const trimmed = tag.trim()
        const label = (trimmed.startsWith('@') ? trimmed.slice(1) : trimmed).trim()
        if (!label || seen.has(label)) continue
        seen.add(label)
        result.push({label, kind: isJiraTag(trimmed) ? 'ticket' : 'other'})
    }
    return result
}

/**
 * Raw tags from a test's metadata. Discover rows can carry metadata as a JSON *string*
 * (older double-encoded rows), so accept both an object and a string.
 */
function getRawTags(test: Pick<TestResult, 'metadata'> | null | undefined): unknown {
    let metadata: unknown = test?.metadata
    if (typeof metadata === 'string') {
        try {
            metadata = JSON.parse(metadata)
        } catch {
            return undefined
        }
    }
    if (!metadata || typeof metadata !== 'object') return undefined
    return (metadata as {tags?: unknown}).tags
}

export function getTestDisplayTags(
    test: Pick<TestResult, 'metadata'> | null | undefined,
    mode: TagMode = 'tickets'
): DisplayTag[] {
    return getDisplayTags(getRawTags(test), mode)
}

/** Ticket keys for a test (tickets mode). */
export function getTestJiraKeys(test: Pick<TestResult, 'metadata'> | null | undefined): string[] {
    return getTestDisplayTags(test, 'tickets').map((tag) => tag.label)
}

/** `baseUrl` is normalised server-side to end with '/'; empty = links disabled. */
export function buildJiraUrl(baseUrl: string, key: string): string | null {
    return baseUrl ? `${baseUrl}${key}` : null
}

/**
 * Does a DISPLAYED tag match the search query? Case-insensitive substring on the label;
 * one leading '@' in the query is ignored. Shared by list search and chip highlight so
 * they cannot disagree. An empty query (or a lone '@') never matches.
 */
export function displayTagMatchesQuery(label: string, query: string): boolean {
    const needle = query.startsWith('@') ? query.slice(1) : query
    return !!needle && label.toLowerCase().includes(needle.toLowerCase())
}

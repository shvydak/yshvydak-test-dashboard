// Ticket-key tag matcher. Deliberately duplicated from
// packages/web/src/features/tests/utils/jiraTags.ts (JIRA_TAG_PATTERN) — same reasoning as
// generateStableTestId (CLAUDE.md invariant 3): a small, stable pattern kept byte-identical
// across two packages rather than pulled into a shared dependency. Keep both in sync.
const JIRA_TAG_PATTERN = /^@[A-Z][A-Z0-9]+-\d+$/

/** Ticket keys ("ABC-123") found in raw Playwright tags, de-duplicated, order not significant. */
export function extractJiraTicketKeys(tags: unknown): string[] {
    if (!Array.isArray(tags)) return []
    const keys = tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter((tag) => JIRA_TAG_PATTERN.test(tag))
        .map((tag) => tag.slice(1))
    return Array.from(new Set(keys))
}

/**
 * Ticket keys referenced anywhere across a set of raw `metadata` JSON strings (as stored in
 * test_results.metadata). Tolerates the same double-encoding edge case as the frontend
 * (getTestDisplayTags in jiraTags.ts) — some discovered-test rows carry metadata as a JSON
 * string instead of an object.
 */
export function extractJiraTicketKeysFromMetadataRows(
    rows: Array<{metadata: string | null}>
): string[] {
    const keys = new Set<string>()

    for (const row of rows) {
        if (!row.metadata) continue

        let metadata: unknown
        try {
            metadata = JSON.parse(row.metadata)
        } catch {
            continue
        }
        if (typeof metadata === 'string') {
            try {
                metadata = JSON.parse(metadata)
            } catch {
                continue
            }
        }
        if (!metadata || typeof metadata !== 'object') continue

        const tags = (metadata as {tags?: unknown}).tags
        for (const key of extractJiraTicketKeys(tags)) {
            keys.add(key)
        }
    }

    return Array.from(keys)
}

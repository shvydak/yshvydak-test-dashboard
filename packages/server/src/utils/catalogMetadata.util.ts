// Overlay of the test catalog (latest `--list`) onto a test's latest result row, and the
// "not in code" decision. Pure functions: the list query supplies the catalog_* columns.

const STATIC_KEYS = ['tags', 'describe', 'annotations', 'line', 'column'] as const

// ISO-Z -> instant. Legacy `YYYY-MM-DD HH:MM:SS` (SQLite CURRENT_TIMESTAMP) is UTC, but a bare
// Date.parse reads it as local time, so it is rewritten to ISO-Z first. Unparseable -> NaN.
export function parseDbTimestamp(value: string | null | undefined): number {
    if (!value) return NaN
    const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
        ? value.replace(' ', 'T') + 'Z'
        : value
    return Date.parse(iso)
}

// Metadata may be double-encoded (a JSON string inside JSON), so a string is parsed once more.
export function parseMetadata(value: unknown): Record<string, any> {
    let v = value
    if (typeof v === 'string') {
        try {
            v = JSON.parse(v)
        } catch {
            return {}
        }
    }
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {}
}

// The catalog wins only when it parses to an object and is strictly newer than the row; then its
// static keys replace the row's (a key the catalog omits is dropped), run-only keys stay.
// Otherwise the row's metadata comes back untouched.
export function overlayCatalogMetadata(
    rowMetadata: unknown,
    catalogMetadataJson: string | null | undefined,
    catalogDiscoveredAt: string | null | undefined,
    rowCreatedAt: string
): unknown {
    if (!catalogMetadataJson || !catalogDiscoveredAt) return rowMetadata
    const catalogTime = parseDbTimestamp(catalogDiscoveredAt)
    const rowTime = parseDbTimestamp(rowCreatedAt)
    if (!(catalogTime > rowTime)) return rowMetadata

    let catalog: unknown
    try {
        catalog = JSON.parse(catalogMetadataJson)
    } catch {
        return rowMetadata
    }
    if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) return rowMetadata
    const catalogMeta = catalog as Record<string, any>

    const merged = {...parseMetadata(rowMetadata)}
    for (const key of STATIC_KEYS) {
        if (key in catalogMeta) merged[key] = catalogMeta[key]
        else delete merged[key]
    }
    return merged
}

export interface CatalogColumns {
    created_at: string
    catalog_discovered_at?: string | null
    catalog_last_scan?: string | null
    catalog_last_full_scan?: string | null
    in_any_catalog?: number | null
}

// Flagged only when ALL hold: (a) no catalog row for (project, test); (b) an all-projects scan has
// happened and the latest row is older than the last one (a test first run after it is not an
// orphan; with no full scan yet nothing is flagged -- a scoped scan cannot see a test that moved
// projects); (c) the test is in no project's catalog; (d) the project has catalog rows at all.
export function isNotInCode(row: CatalogColumns): boolean {
    if (row.catalog_discovered_at || !row.catalog_last_scan || row.in_any_catalog) return false
    if (!row.catalog_last_full_scan) return false
    return parseDbTimestamp(row.created_at) < parseDbTimestamp(row.catalog_last_full_scan)
}

import {BaseRepository} from './base.repository'

export interface AttachmentCleanupEntry {
    testResultId: string
    freedBytes: number
}

/**
 * Records executions whose attachments were stripped to free disk space.
 *
 * INSERT-only by design: the `test_results` row is never mutated. When a strip
 * cleanup runs we add a marker here so the UI can show "Attachments removed to
 * free space" instead of confusing the user with a bare "No attachments".
 */
export class AttachmentCleanupRepository extends BaseRepository {
    /**
     * Marks executions as having had their attachments stripped. Idempotent:
     * re-marking an execution refreshes its timestamp and freed-bytes figure.
     */
    async markCleared(entries: AttachmentCleanupEntry[]): Promise<void> {
        if (entries.length === 0) return

        const clearedAt = new Date().toISOString()

        // Batch into multi-row upserts (3 bound params per row, kept under SQLite's
        // variable limit) instead of one round-trip per execution.
        const ROWS_PER_BATCH = 300

        for (let i = 0; i < entries.length; i += ROWS_PER_BATCH) {
            const batch = entries.slice(i, i + ROWS_PER_BATCH)
            const placeholders = batch.map(() => '(?, ?, ?)').join(', ')
            const params = batch.flatMap((e) => [e.testResultId, clearedAt, e.freedBytes])

            await this.execute(
                `INSERT INTO attachment_cleanups (test_result_id, cleared_at, freed_bytes)
                 VALUES ${placeholders}
                 ON CONFLICT(test_result_id) DO UPDATE SET
                     cleared_at = excluded.cleared_at,
                     freed_bytes = excluded.freed_bytes`,
                params
            )
        }
    }
}

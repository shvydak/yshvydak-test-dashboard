import {
    MAX_CONSOLE_CHARS,
    MAX_CONSOLE_LINE_CHARS,
    MAX_CONSOLE_ENTRIES,
    MAX_ERRORS,
    MAX_ERROR_ENTRY_CHARS,
    MAX_ERROR_MESSAGE_CHARS,
    MAX_ERROR_STACK_CHARS,
    MAX_PAYLOAD_CHARS,
    MAX_STEPS,
    MAX_STEP_TITLE_CHARS,
} from './constants'
import type {TestRow} from './types'

export function cut(text: string | undefined, max: number): string | undefined {
    if (text === undefined || text === null) return undefined
    return text.length <= max ? text : `${text.slice(0, max)}…[+${text.length - max} chars]`
}

export function firstLine(text: string | undefined, max: number): string | undefined {
    if (!text) return undefined
    return cut(text.split('\n').find((l) => l.trim() !== '') ?? '', max)
}

// Playwright error text carries ANSI colour codes

const ANSI = /\x1b\[[0-9;]*m/g
export const plain = (text: string | undefined) => text?.replace(ANSI, '')

export const fileWithLine = (row: TestRow) =>
    row.metadata?.line ? `${row.filePath}:${row.metadata.line}` : row.filePath

export function errorDetail(row: TestRow, scale: number) {
    const errors = (row.metadata?.errors ?? []).slice(0, MAX_ERRORS).map((e) => ({
        message: cut(plain(e.message), MAX_ERROR_ENTRY_CHARS * scale),
        stack: cut(plain(e.stack), MAX_ERROR_ENTRY_CHARS * scale),
    }))
    if (!row.errorMessage && !row.errorStack && errors.length === 0) return undefined
    return {
        message: cut(plain(row.errorMessage), MAX_ERROR_MESSAGE_CHARS * scale),
        stack: cut(plain(row.errorStack), MAX_ERROR_STACK_CHARS * scale),
        errors: errors.length > 0 ? errors : undefined,
    }
}

// Failed steps first, then the last steps
export function stepsDetail(row: TestRow, scale: number) {
    const steps = row.metadata?.steps ?? []
    const failed = steps.filter((s) => s.error).slice(-MAX_STEPS * scale)
    const tail = steps.slice(-MAX_STEPS * scale)
    const picked = [...new Set([...failed, ...tail])]
    return picked.map((s) => ({
        title: cut(s.title, MAX_STEP_TITLE_CHARS),
        error: cut(plain(s.error), MAX_ERROR_ENTRY_CHARS),
        ms: s.duration,
    }))
}

// Newest lines first: one long or old line must never push the latest output out. Each line is
// cut to the same length in every mode, so a bigger scale only adds lines.
export function consoleDetail(row: TestRow, scale: number) {
    const entries = (row.metadata?.console?.entries ?? []).slice(-MAX_CONSOLE_ENTRIES * scale)
    const out: string[] = []
    let used = 0
    for (const e of [...entries].reverse()) {
        const line = cut(`[${e.type}] ${e.text}`, MAX_CONSOLE_LINE_CHARS)!
        if (used + line.length > MAX_CONSOLE_CHARS * scale) break
        used += line.length
        out.push(line)
    }
    return out.reverse()
}

export function json(obj: unknown): string {
    return JSON.stringify(obj)
}

// Shrink an object to fit the payload cap: drop the named fields in order, then cut long strings.
export function fitPayload<T extends Record<string, unknown>>(obj: T, dropOrder: string[]): T {
    const copy: Record<string, unknown> = {...obj}
    if (json(copy).length <= MAX_PAYLOAD_CHARS) return copy as T
    copy.truncated = true
    for (const key of dropOrder) {
        const [head, child] = key.split('.')
        if (child && copy[head] && typeof copy[head] === 'object') {
            copy[head] = {...(copy[head] as Record<string, unknown>)}
            delete (copy[head] as Record<string, unknown>)[child]
        } else {
            delete copy[key]
        }
        if (json(copy).length <= MAX_PAYLOAD_CHARS) return copy as T
    }
    return copy as T
}

// Drop rows from the end until the serialized payload fits.
export function fitRows<R>(
    rows: R[],
    build: (kept: R[]) => Record<string, unknown>
): Record<string, unknown> {
    let kept = rows
    let out = build(kept)
    while (json(out).length > MAX_PAYLOAD_CHARS && kept.length > 1) {
        kept = kept.slice(0, Math.floor(kept.length / 2))
        out = {...build(kept), truncated: true}
    }
    return out
}

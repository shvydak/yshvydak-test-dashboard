import fs from 'fs'
import path from 'path'

// Ids that end up in file paths or argv: UUIDs and stable test ids (`<prefix><base36>`). No dots or slashes.
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/

export function isSafeId(value: unknown): value is string {
    return typeof value === 'string' && SAFE_ID.test(value)
}

function realpathOrSelf(p: string): string {
    try {
        return fs.realpathSync(p)
    } catch {
        return p
    }
}

/** True when `target` (symlinks resolved) lies inside `baseDir` (symlinks resolved). Both must exist for symlinks to be followed. */
export function isInsideDir(target: string, baseDir: string): boolean {
    const base = realpathOrSelf(path.resolve(baseDir))
    const resolved = realpathOrSelf(path.resolve(target))
    const rel = path.relative(base, resolved)
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/** Joins `segments` onto `baseDir` and returns the result; throws if it would land outside `baseDir` (or on it). Lexical: the target may not exist yet. */
export function resolveInside(baseDir: string, ...segments: string[]): string {
    const base = path.resolve(baseDir)
    const resolved = path.resolve(base, ...segments)
    if (!resolved.startsWith(base + path.sep)) {
        throw new Error('Path escapes storage directory')
    }
    return resolved
}

/**
 * A positional CLI value from a request: not an option, and inside `baseDir` once resolved against it.
 * Lexical on purpose: stored spec paths are reporter-normalized and don't exist on disk, and a
 * symlink in baseDir must not reject them. The value is a Playwright filter, never opened by us.
 */
export function isSafeCliPath(value: unknown, baseDir: string): value is string {
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('-')) return false
    const base = path.resolve(baseDir)
    const rel = path.relative(base, path.resolve(base, value))
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

// Server-only secrets: never inherited by the spawned Playwright process (test code can read its env).
export const SERVER_SECRET_ENV = [
    'JWT_SECRET',
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD',
    'ADMIN_USERS',
    'JIRA_BASE_URL',
    'JIRA_EMAIL',
    'JIRA_API_TOKEN',
    'CI_SLACK_WEBHOOK_URL',
] as const

export function stripServerSecrets(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const copy = {...env}
    for (const name of SERVER_SECRET_ENV) delete copy[name]
    return copy
}

import {
    REQUEST_TIMEOUT_MS,
    RUN_MAX_NAME_CHARS,
    RUN_MAX_PATH_CHARS,
    RUN_MAX_TEST_NAMES,
    RUN_MAX_WORKERS,
} from './constants'

// The ONLY module that calls fetch. Read-only by default, enforced here: GET on an allowlist of
// fixed paths, plus POST to exactly the login path. Only with allowRuns (run tools on) does it
// also POST to the two run-start paths below, each with a strictly validated body. Adding a tool
// that needs a new endpoint means adding its path here. Never allowlist /api/tests/projects or /api/tests/diagnostics: both
// spawn `playwright test --list` on the server.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
// Server's generateStableTestId: `test-` + base36
const TEST_ID = 'test-[0-9a-z]{1,16}'
export const UUID_RE = new RegExp(`^${UUID}$`, 'i')
export const TEST_ID_RE = new RegExp(`^${TEST_ID}$`)

const ALLOWED_GET: RegExp[] = [
    /^\/api\/auth\/config$/,
    /^\/api\/settings\/project-tabs$/,
    /^\/api\/jira\/status$/,
    /^\/api\/jira\/tickets$/,
    /^\/api\/tests$/,
    /^\/api\/tests\/summary-by-project$/,
    new RegExp(`^/api/tests/by-test-id/${TEST_ID}$`),
    new RegExp(`^/api/tests/${UUID}$`, 'i'),
    new RegExp(`^/api/runs/${UUID}$`, 'i'),
    new RegExp(`^/api/tests/${TEST_ID}/history$`),
    new RegExp(
        `^/attachments/${UUID}/(?!\\.\\.?$)(?:[A-Za-z0-9._~-]|%(?!2[fe]|5c)[0-9a-f]{2})+$`,
        'i'
    ),
]
export const LOGIN_PATH = '/api/auth/login'

// The only non-login POSTs, reachable only with allowRuns. Never stop/force-reset/run-all/
// pipeline/settings/delete routes.
export const RERUN_PATH_RE = new RegExp(`^/api/tests/${UUID}/rerun$`, 'i')
export const RUN_GROUP_PATH = '/api/tests/run-group'

const hasControlChars = (s: string) => /[\x00-\x1f\x7f]/.test(s)
const isWorkers = (n: unknown) =>
    Number.isInteger(n) && (n as number) >= 1 && (n as number) <= RUN_MAX_WORKERS
const hasOnlyKeys = (o: object, keys: string[]) => Object.keys(o).every((k) => keys.includes(k))

// A plain spec file path. Playwright reads a positional as an unanchored regex, so anything but
// [A-Za-z0-9_.-] and "/" (e.g. ".*", "a|b", "spec") could match more than one file: refused.
const SPEC_PATH_RE =
    /^[A-Za-z0-9_][A-Za-z0-9_.-]*(\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*\.(spec|test)\.[cm]?[jt]sx?$/

export function isSafeRunFilePath(p: unknown): p is string {
    return typeof p === 'string' && p.length <= RUN_MAX_PATH_CHARS && SPEC_PATH_RE.test(p)
}

function isPlainObject(b: unknown): b is Record<string, unknown> {
    return typeof b === 'object' && b !== null && !Array.isArray(b)
}

export function isAllowedRunPost(path: string, body: unknown): boolean {
    if (!isPlainObject(body)) return false
    if (RERUN_PATH_RE.test(path)) {
        return hasOnlyKeys(body, ['maxWorkers']) && isWorkers(body.maxWorkers)
    }
    if (path === RUN_GROUP_PATH) {
        if (!hasOnlyKeys(body, ['filePath', 'maxWorkers', 'testNames'])) return false
        if (!isSafeRunFilePath(body.filePath) || !isWorkers(body.maxWorkers)) return false
        const names = body.testNames
        if (names === undefined) return true
        return (
            Array.isArray(names) &&
            names.length >= 1 &&
            names.length <= RUN_MAX_TEST_NAMES &&
            names.every(
                (n) =>
                    typeof n === 'string' &&
                    n.length > 0 &&
                    n.length <= RUN_MAX_NAME_CHARS &&
                    !hasControlChars(n)
            )
        )
    }
    return false
}

export type Query = Record<string, string | number | undefined>

export interface HttpResult {
    status: number
    body: Buffer
    contentType: string
}

export interface GetOptions {
    query?: Query
    headers?: Record<string, string>
    maxBytes?: number
}

export class HttpGuardError extends Error {}
// The byte cap, as opposed to a guard rejection
export class SizeCapError extends HttpGuardError {}

export interface Http {
    // Run tools on (set once at creation)
    readonly runsEnabled: boolean
    get(path: string, opts?: GetOptions): Promise<HttpResult>
    postLogin(body: {email: string; password: string}): Promise<HttpResult>
    // Start a run: only the two run-start paths, only with runsEnabled
    postRun(path: string, body: unknown, headers?: Record<string, string>): Promise<HttpResult>
}

export function isAllowedGet(path: string): boolean {
    return ALLOWED_GET.some((re) => re.test(path))
}

export function createHttp(
    root: string,
    fetchFn: typeof fetch = fetch,
    opts: {allowRuns?: boolean} = {}
): Http {
    const allowRuns = opts.allowRuns === true
    const rootUrl = new URL(root)
    const prefix = rootUrl.pathname.replace(/\/$/, '')

    async function send(method: 'GET' | 'POST', path: string, init: RequestInit & GetOptions) {
        const url = new URL(`${rootUrl.origin}${prefix}${path}`)
        if (url.origin !== rootUrl.origin) throw new HttpGuardError('Cross-origin request blocked')
        // URL parsing resolves %2e%2e and similar: the request must hit exactly the validated path
        if (url.pathname !== `${prefix}${path}`) throw new HttpGuardError('Path was normalised')
        for (const [k, v] of Object.entries(init.query ?? {})) {
            if (v !== undefined) url.searchParams.set(k, String(v))
        }
        const res = await fetchFn(url, {
            method,
            headers: init.headers,
            body: init.body,
            redirect: 'error',
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
        const declared = Number(res.headers.get('content-length') ?? 0)
        if (init.maxBytes && declared > init.maxBytes) {
            await res.body?.cancel()
            throw new SizeCapError(`Response larger than ${init.maxBytes} bytes`)
        }
        const chunks: Buffer[] = []
        let total = 0
        if (res.body) {
            for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
                total += chunk.length
                if (init.maxBytes && total > init.maxBytes) {
                    throw new SizeCapError(`Response larger than ${init.maxBytes} bytes`)
                }
                chunks.push(Buffer.from(chunk))
            }
        }
        return {
            status: res.status,
            body: Buffer.concat(chunks),
            contentType: res.headers.get('content-type') ?? '',
        }
    }

    return {
        runsEnabled: allowRuns,
        async get(path, opts = {}) {
            if (!isAllowedGet(path)) throw new HttpGuardError(`Path not allowed: ${path}`)
            return send('GET', path, opts)
        },
        async postRun(path, body, headers = {}) {
            if (!allowRuns) throw new HttpGuardError('Runs are disabled for this dashboard')
            if (!isAllowedRunPost(path, body)) throw new HttpGuardError(`POST not allowed: ${path}`)
            return send('POST', path, {
                headers: {...headers, 'Content-Type': 'application/json'},
                body: JSON.stringify(body),
            })
        },
        postLogin(body) {
            return send('POST', LOGIN_PATH, {
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body),
            })
        },
    }
}

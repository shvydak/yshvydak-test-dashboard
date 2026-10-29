import {REQUEST_TIMEOUT_MS} from './constants'

// The ONLY module that calls fetch. Read-only is enforced here: GET on an allowlist of fixed
// paths, plus POST to exactly the login path. Adding a tool that needs a new endpoint means
// adding its path here. Never allowlist /api/tests/projects or /api/tests/diagnostics: both
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
    new RegExp(`^/api/tests/${TEST_ID}/history$`),
    new RegExp(
        `^/attachments/${UUID}/(?!\\.\\.?$)(?:[A-Za-z0-9._~-]|%(?!2[fe]|5c)[0-9a-f]{2})+$`,
        'i'
    ),
]
export const LOGIN_PATH = '/api/auth/login'

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
    get(path: string, opts?: GetOptions): Promise<HttpResult>
    postLogin(body: {email: string; password: string}): Promise<HttpResult>
}

export function isAllowedGet(path: string): boolean {
    return ALLOWED_GET.some((re) => re.test(path))
}

export function createHttp(root: string, fetchFn: typeof fetch = fetch): Http {
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
        async get(path, opts = {}) {
            if (!isAllowedGet(path)) throw new HttpGuardError(`Path not allowed: ${path}`)
            return send('GET', path, opts)
        },
        postLogin(body) {
            return send('POST', LOGIN_PATH, {
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body),
            })
        },
    }
}

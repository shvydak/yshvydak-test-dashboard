export interface Config {
    // Server root with any reverse-proxy path prefix, no trailing slash and no /api
    root: string
    email?: string
    password?: string
    passwordCmd?: string
    token?: string
    // Run tools (start a run): on by default only for a local dashboard, DASHBOARD_ALLOW_RUNS overrides
    allowRuns: boolean
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

function parseAllowRuns(raw: string | undefined, hostname: string): boolean {
    const v = raw?.trim().toLowerCase()
    if (!v) return LOCAL_HOSTNAMES.has(hostname)
    if (v === 'true') return true
    if (v === 'false') return false
    throw new Error('DASHBOARD_ALLOW_RUNS must be true or false')
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
    const raw = env.DASHBOARD_URL?.trim()
    if (!raw) throw new Error('DASHBOARD_URL is required (server root, e.g. http://localhost:3001)')
    let url: URL
    try {
        url = new URL(raw)
    } catch {
        throw new Error('DASHBOARD_URL is not a valid URL')
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('DASHBOARD_URL must be http or https')
    }
    const pathname = url.pathname.replace(/\/+$/, '').replace(/\/api$/, '')
    return {
        root: `${url.origin}${pathname}`,
        email: env.DASHBOARD_EMAIL?.trim() || undefined,
        password: env.DASHBOARD_PASSWORD || undefined,
        passwordCmd: env.DASHBOARD_PASSWORD_CMD?.trim() || undefined,
        token: env.DASHBOARD_TOKEN?.trim() || undefined,
        allowRuns: parseAllowRuns(env.DASHBOARD_ALLOW_RUNS, url.hostname),
    }
}

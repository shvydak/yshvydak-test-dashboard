import {execFile} from 'node:child_process'
import type {Config} from './config'
import {PASSWORD_CMD_TIMEOUT_MS} from './constants'
import type {GetOptions, Http, HttpResult} from './http'

// Errors here carry only fixed text: never a password, token or response body.
export class DashboardError extends Error {
    constructor(
        message: string,
        readonly status?: number
    ) {
        super(message)
    }
}

export type PasswordCmdRunner = (cmd: string) => Promise<string>

const defaultRunner: PasswordCmdRunner = (cmd) =>
    new Promise((resolve, reject) => {
        execFile('/bin/sh', ['-c', cmd], {timeout: PASSWORD_CMD_TIMEOUT_MS}, (err, stdout) => {
            if (err) reject(new DashboardError('DASHBOARD_PASSWORD_CMD failed'))
            else resolve(stdout.trim())
        })
    })

// Holds the login state: one login, token kept in memory, one re-login on a 401, no loops.
export class Session {
    private token: string | undefined
    private authEnabled: boolean | undefined

    constructor(
        private readonly config: Config,
        private readonly http: Http,
        private readonly runPasswordCmd: PasswordCmdRunner = defaultRunner
    ) {
        this.token = config.token
    }

    private probeInFlight: Promise<boolean> | undefined

    // Parallel first calls share one probe
    isAuthEnabled(): Promise<boolean> {
        if (this.authEnabled !== undefined) return Promise.resolve(this.authEnabled)
        this.probeInFlight ??= this.probe().finally(() => {
            this.probeInFlight = undefined
        })
        return this.probeInFlight
    }

    private async probe(): Promise<boolean> {
        const res = await this.http.get('/api/auth/config')
        if (res.status !== 200) throw new DashboardError('Cannot read auth config', res.status)
        this.authEnabled = JSON.parse(res.body.toString('utf8')).data?.authEnabled === true
        return this.authEnabled
    }

    get runsEnabled(): boolean {
        return this.http.runsEnabled
    }

    async get(path: string, opts: GetOptions = {}) {
        const enabled = path === '/api/auth/config' ? false : await this.isAuthEnabled()
        if (!enabled) return this.http.get(path, opts)
        return this.authed((headers) =>
            this.http.get(path, {...opts, headers: {...opts.headers, ...headers}})
        )
    }

    // A run start is retried only after a 401, which means the server did not start anything
    async postRun(path: string, body: unknown) {
        if (!(await this.isAuthEnabled())) return this.http.postRun(path, body)
        return this.authed((headers) => this.http.postRun(path, body, headers))
    }

    private async authed(send: (headers: Record<string, string>) => Promise<HttpResult>) {
        if (!this.token) await this.login()
        let res = await send(this.authHeader())
        if (res.status === 401) {
            if (this.config.token && !this.canLogin()) {
                throw new DashboardError('DASHBOARD_TOKEN was rejected (expired?)', 401)
            }
            await this.login()
            res = await send(this.authHeader())
            if (res.status === 401) throw new DashboardError('Login failed: still 401', 401)
        }
        return res
    }

    private authHeader(): Record<string, string> {
        return {Authorization: `Bearer ${this.token}`}
    }

    private canLogin(): boolean {
        return Boolean(this.config.email && (this.config.passwordCmd || this.config.password))
    }

    // Parallel tool calls share one login
    private loginInFlight: Promise<void> | undefined

    private login(): Promise<void> {
        this.loginInFlight ??= this.doLogin().finally(() => {
            this.loginInFlight = undefined
        })
        return this.loginInFlight
    }

    private async doLogin(): Promise<void> {
        const {email, passwordCmd, password} = this.config
        if (!email || !(passwordCmd || password)) {
            throw new DashboardError(
                'Login is on: set DASHBOARD_EMAIL and DASHBOARD_PASSWORD_CMD (or DASHBOARD_PASSWORD), or DASHBOARD_TOKEN'
            )
        }
        const secret = passwordCmd ? await this.runPasswordCmd(passwordCmd) : password!
        const res = await this.http.postLogin({email, password: secret})
        if (res.status !== 200) {
            throw new DashboardError(`Login failed (HTTP ${res.status})`, res.status)
        }
        const token = JSON.parse(res.body.toString('utf8')).data?.token
        if (typeof token !== 'string' || !token) throw new DashboardError('Login returned no token')
        this.token = token
    }
}

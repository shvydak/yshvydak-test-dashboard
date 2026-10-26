import http from 'http'
import type {Express} from 'express'
import {Logger} from './logger.util'

// Loopback-only listener on an ephemeral port. The spawned Playwright reporter posts here without a JWT;
// the main port always needs one. Trust is the local socket port, never the remote address —
// nginx proxies public traffic from 127.0.0.1.
const INTERNAL_HOST = '127.0.0.1'

let internalPort: number | null = null

export function getInternalPort(): number | null {
    return internalPort
}

export function getInternalApiUrl(): string | null {
    return internalPort ? `http://${INTERNAL_HOST}:${internalPort}` : null
}

export function startInternalListener(app: Express): Promise<http.Server> {
    return new Promise((resolve, reject) => {
        const server = http.createServer(app)
        server.once('error', reject)
        server.unref()
        server.listen(0, INTERNAL_HOST, () => {
            const address = server.address()
            if (address && typeof address === 'object') {
                internalPort = address.port
            }
            server.once('close', () => {
                internalPort = null
            })
            Logger.info(`🔒 Internal reporter listener on ${INTERNAL_HOST}:${internalPort}`)
            resolve(server)
        })
    })
}

export function closeInternalListener(server: http.Server): void {
    server.close()
    server.closeIdleConnections?.()
}

/** Test helper: pretend the internal listener runs on this port (null = not running). */
export function setInternalPortForTests(port: number | null): void {
    internalPort = port
}

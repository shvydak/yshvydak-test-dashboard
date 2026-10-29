#!/usr/bin/env node
import {serveStdio} from '@modelcontextprotocol/server/stdio'
import {Session} from './auth'
import {DashboardClient} from './client'
import {loadConfig} from './config'
import {createHttp} from './http'
import {createServer} from './server'
import {createTools} from './tools'

// stdout carries the protocol: log to stderr only, and never a token or password
function main() {
    let config
    try {
        config = loadConfig(process.env)
    } catch (err) {
        console.error(`test-dashboard-mcp: ${err instanceof Error ? err.message : err}`)
        process.exit(1)
    }
    const client = new DashboardClient(
        new Session(config, createHttp(config.root, fetch, {allowRuns: config.allowRuns}))
    )
    const host = new URL(config.root).host
    serveStdio(() => createServer(createTools(client, host)), {
        onerror: (err) => console.error(`test-dashboard-mcp: ${err.message}`),
    })
}

main()

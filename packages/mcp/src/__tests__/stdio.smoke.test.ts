import {spawn, spawnSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import path from 'node:path'
import {beforeAll, describe, expect, it} from 'vitest'

const pkg = path.resolve(__dirname, '../..')
const entry = path.join(pkg, 'dist/index.js')

// Spawns the built server and speaks raw JSON-RPC over stdio: stdout must carry protocol only.
describe('stdio smoke', () => {
    beforeAll(() => {
        // Always rebuild: root `npm test` runs no build first, a stale dist would pass silently
        const r = spawnSync('npx', ['tsc', '-p', pkg], {encoding: 'utf8'})
        if (r.status !== 0) throw new Error(`build failed: ${r.stdout}${r.stderr}`)
        expect(existsSync(entry)).toBe(true)
    }, 120_000)

    it('answers initialize and tools/list with the eight tools', async () => {
        const child = spawn('node', [entry], {
            env: {PATH: process.env.PATH, DASHBOARD_URL: 'http://127.0.0.1:9'},
            stdio: ['pipe', 'pipe', 'pipe'],
        })
        const lines: string[] = []
        let buf = ''
        child.stdout.on('data', (d) => {
            buf += d
            const parts = buf.split('\n')
            buf = parts.pop()!
            lines.push(...parts.filter(Boolean))
        })
        const send = (msg: unknown) => child.stdin.write(`${JSON.stringify(msg)}\n`)
        const until = async (pred: () => boolean) => {
            for (let i = 0; i < 100 && !pred(); i++) await new Promise((r) => setTimeout(r, 50))
            expect(pred()).toBe(true)
        }
        try {
            send({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2025-06-18',
                    capabilities: {},
                    clientInfo: {name: 'smoke', version: '0'},
                },
            })
            await until(() => lines.length >= 1)
            send({jsonrpc: '2.0', method: 'notifications/initialized'})
            send({jsonrpc: '2.0', id: 2, method: 'tools/list', params: {}})
            await until(() => lines.length >= 2)
            // every stdout line is JSON-RPC
            const msgs = lines.map((l) => JSON.parse(l))
            expect(msgs.every((m) => m.jsonrpc === '2.0')).toBe(true)
            const list = msgs.find((m) => m.id === 2).result.tools
            expect(list.map((t: {name: string}) => t.name).sort()).toEqual([
                'dashboard_overview',
                'get_run_status',
                'get_screenshots',
                'get_test',
                'get_test_history',
                'list_tests',
                'rerun_test',
                'run_test_file',
            ])
            // only the two run-start tools are not read-only
            expect(
                list
                    .filter(
                        (t: {annotations: {readOnlyHint: boolean}}) => !t.annotations.readOnlyHint
                    )
                    .map((t: {name: string}) => t.name)
                    .sort()
            ).toEqual(['rerun_test', 'run_test_file'])
        } finally {
            child.kill()
        }
    }, 30_000)

    it('exits with a clear message when DASHBOARD_URL is missing', () => {
        const r = spawnSync('node', [entry], {env: {PATH: process.env.PATH}, encoding: 'utf8'})
        expect(r.status).toBe(1)
        expect(r.stderr).toMatch(/DASHBOARD_URL/)
        expect(r.stdout).toBe('')
    })
})

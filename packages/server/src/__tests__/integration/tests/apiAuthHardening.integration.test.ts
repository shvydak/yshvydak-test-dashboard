import {describe, it, expect, beforeAll, afterAll, beforeEach, afterEach} from 'vitest'
import request from 'supertest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import http, {type Server} from 'http'
import type {TestServerInstance} from '../helpers/testServer'
import {setupTestServer, teardownTestServer, cleanDatabase} from '../helpers/testServer'
import {seedTestRuns} from '../helpers/database'
import {
    startInternalListener,
    closeInternalListener,
    getInternalApiUrl,
} from '../../../utils/internalListener.util'

describe('API auth hardening (Integration)', () => {
    let server: TestServerInstance
    let internal: Server
    let outsideDir: string
    let originalEnableAuth: string | undefined

    const result = (over: Record<string, unknown> = {}) => ({
        id: 'res-1',
        testId: 'test-abc',
        runId: 'run-1',
        name: 'A test',
        filePath: 'tests/a.spec.ts',
        status: 'passed',
        duration: 1,
        ...over,
    })
    // node:http, not fetch: other suites stub the global fetch
    const internalCall = (method: string, url: string, body?: unknown) =>
        new Promise<{status: number}>((resolve, reject) => {
            const payload = body === undefined ? undefined : JSON.stringify(body)
            const req = http.request(
                `${getInternalApiUrl()}${url}`,
                {method, headers: {'Content-Type': 'application/json'}},
                (res) => {
                    res.resume()
                    res.on('end', () => resolve({status: res.statusCode ?? 0}))
                }
            )
            req.on('error', reject)
            if (payload) req.write(payload)
            req.end()
        })
    const authOn = () => {
        process.env.ENABLE_AUTH = 'true'
    }
    const authOff = () => {
        process.env.ENABLE_AUTH = 'false'
    }

    beforeAll(async () => {
        originalEnableAuth = process.env.ENABLE_AUTH
        server = await setupTestServer()
        internal = await startInternalListener(server.app)
        outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'))
    })

    afterAll(async () => {
        closeInternalListener(internal)
        if (originalEnableAuth === undefined) delete process.env.ENABLE_AUTH
        else process.env.ENABLE_AUTH = originalEnableAuth
        await teardownTestServer(server)
        fs.rmSync(outsideDir, {recursive: true, force: true})
    })

    beforeEach(async () => {
        authOff()
        await cleanDatabase(server.testRepository)
        await seedTestRuns(server.testRepository.dbManager, [{id: 'run-1', status: 'running'}])
    })

    afterEach(authOff)

    describe('JWT on the main port (ENABLE_AUTH=true)', () => {
        it.each([
            ['GET', '/api/tests'],
            ['GET', '/api/tests/diagnostics'],
            ['GET', '/api/tests/stats'],
            ['DELETE', '/api/tests/all'],
            ['POST', '/api/tests/run-all'],
            ['GET', '/api/runs'],
            ['GET', '/api/storage/stats'],
            ['GET', '/api/pipeline/status/current'],
            ['GET', '/api/pipeline/status/abc'],
        ])('%s %s without a token → 401', async (method, url) => {
            authOn()
            const res = await (request(server.app) as any)[method.toLowerCase()](url)
            expect(res.status).toBe(401)
        })

        it('keeps /api/health and /api/auth/config public', async () => {
            authOn()
            await request(server.app).get('/api/health').expect(200)
            await request(server.app).get('/api/auth/config').expect(200)
        })

        it('accepts a valid JWT from the header and from ?token=', async () => {
            authOn()
            await request(server.app)
                .get('/api/tests/diagnostics')
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)
            await request(server.app).get(`/api/runs?token=${server.authToken}`).expect(200)
        })

        it('reporter routes on the main port need a JWT too', async () => {
            authOn()
            await request(server.app).post('/api/tests').send(result()).expect(401)
            await request(server.app).post('/api/tests/process-start').send({}).expect(401)
            await request(server.app).put('/api/runs/run-1').send({status: 'completed'}).expect(401)
        })

        it('ENABLE_AUTH=false leaves everything open', async () => {
            // /pipeline/status/current may be 404 (nothing running) — it just must not be 401
            for (const url of [
                '/api/tests',
                '/api/runs',
                '/api/storage/stats',
                '/api/pipeline/status/current',
            ]) {
                const res = await request(server.app).get(url)
                expect(res.status, url).not.toBe(401)
                expect(res.status, url).not.toBe(403)
            }
            await request(server.app).get('/api/tests').expect(200)
        })
    })

    describe('internal loopback listener', () => {
        it('accepts the 5 reporter routes without a JWT', async () => {
            authOn()
            expect(
                (
                    await internalCall('POST', '/api/tests/process-start', {
                        runId: 'run-1',
                        type: 'run-all',
                        totalTests: 1,
                    })
                ).status
            ).toBe(200)
            expect(
                (
                    await internalCall('POST', '/api/tests/test-start', {
                        runId: 'run-1',
                        testId: 'test-abc',
                        name: 'A test',
                        filePath: 'tests/a.spec.ts',
                    })
                ).status
            ).toBe(200)
            expect((await internalCall('POST', '/api/tests', result())).status).toBe(200)
            expect(
                (await internalCall('PUT', '/api/runs/run-1', {status: 'completed'})).status
            ).toBe(200)
            expect(
                (
                    await internalCall('POST', '/api/tests/process-end', {
                        runId: 'run-1',
                        status: 'completed',
                    })
                ).status
            ).toBe(200)
        })

        it.each([
            ['GET', '/api/tests'],
            ['GET', '/api/tests/diagnostics'],
            ['DELETE', '/api/tests/all'],
            ['POST', '/api/tests/run-all'],
            ['POST', '/api/tests/force-reset'],
            ['GET', '/api/runs'],
            ['POST', '/api/runs'],
            ['GET', '/api/storage/stats'],
            ['GET', '/api/pipeline/status/current'],
        ])('%s %s still needs a JWT', async (method, url) => {
            authOn()
            expect(
                (await internalCall(method, url, method === 'POST' ? {} : undefined)).status
            ).toBe(401)
        })
    })

    describe('POST /api/tests input hardening', () => {
        it.each([
            ['id', '../../../tmp/evil'],
            ['id', 'a/b'],
            ['testId', '..'],
            ['runId', 'run/../x'],
        ])('rejects a traversal %s (%s) with 400', async (field, value) => {
            const res = await request(server.app)
                .post('/api/tests')
                .send(result({[field]: value}))
            expect(res.status).toBe(400)
        })

        it('does not copy an attachment from outside the Playwright output dir', async () => {
            const secret = path.join(outsideDir, 'secret.env')
            fs.writeFileSync(secret, 'JWT_SECRET=x')

            await request(server.app)
                .post('/api/tests')
                .send(result({attachments: [{name: 'x', path: secret, contentType: 'text/plain'}]}))
                .expect(200)

            const rows = await server.testRepository.dbManager.queryAll('SELECT * FROM attachments')
            expect(rows).toEqual([])
        })

        it('does not follow a symlink inside the output dir that points outside', async () => {
            const secret = path.join(outsideDir, 'secret2.env')
            fs.writeFileSync(secret, 'JWT_SECRET=x')
            const outputDir = path.join(server.dbPath, 'test-results')
            fs.mkdirSync(outputDir, {recursive: true})
            const link = path.join(outputDir, 'link.txt')
            fs.symlinkSync(secret, link)

            await request(server.app)
                .post('/api/tests')
                .send(result({attachments: [{name: 'x', path: link, contentType: 'text/plain'}]}))
                .expect(200)

            const rows = await server.testRepository.dbManager.queryAll('SELECT * FROM attachments')
            expect(rows).toEqual([])
        })

        it('still copies an attachment that Playwright wrote under its output dir', async () => {
            const outputDir = path.join(server.dbPath, 'test-results', 'a-test-chromium')
            fs.mkdirSync(outputDir, {recursive: true})
            const shot = path.join(outputDir, 'shot.png')
            fs.writeFileSync(shot, 'png-bytes')

            await request(server.app)
                .post('/api/tests')
                .send(result({attachments: [{name: 'shot', path: shot, contentType: 'image/png'}]}))
                .expect(200)

            const rows = await server.testRepository.dbManager.queryAll('SELECT * FROM attachments')
            expect(rows).toHaveLength(1)
        })
    })

    describe('POST /api/tests/run-group filePath', () => {
        it.each(['--config=evil.js', '--output=/tmp/x', '../../etc/passwd', '/etc/passwd'])(
            'rejects %s with 400',
            async (filePath) => {
                await request(server.app).post('/api/tests/run-group').send({filePath}).expect(400)
            }
        )
    })

    describe('note image upload', () => {
        it('rejects image/svg+xml', async () => {
            const res = await request(server.app)
                .post('/api/tests/test-abc/notes/images')
                .attach('image', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), {
                    filename: 'x.svg',
                    contentType: 'image/svg+xml',
                })
            expect(res.status).not.toBe(200)
            expect(res.status).not.toBe(201)
        })
    })
})

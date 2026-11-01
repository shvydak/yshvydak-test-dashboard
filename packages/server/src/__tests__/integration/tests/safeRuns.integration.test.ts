/**
 * Safe runs: the file filter handed to Playwright, maxWorkers bounds, the discovery busy guard
 * and force-reset of dead registry entries.
 */
import {describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi} from 'vitest'
import request from 'supertest'
import {EventEmitter} from 'events'
import {spawn} from 'child_process'
import type {TestServerInstance} from '../helpers/testServer'
import {setupTestServer, teardownTestServer, cleanDatabase} from '../helpers/testServer'
import {seedTestRuns} from '../helpers/database'
import {activeProcessesTracker} from '../../../services/activeProcesses.service'
import {runProcessRegistry} from '../../../services/runProcessRegistry.service'

const ORDERS = 'orders/create.spec.ts'
const PURCHASE = 'purchase-orders/create.spec.ts'

describe('Safe runs (Integration)', () => {
    let server: TestServerInstance
    let spawnArgs: string[][]
    let spawned: Array<EventEmitter & {pid?: number}>

    const api = () => ({
        post: (url: string) =>
            request(server.app).post(url).set('Authorization', `Bearer ${server.authToken}`),
    })

    const catalog = async (filePath: string, testId: string) =>
        server.testRepository.dbManager.execute(
            `INSERT INTO test_catalog (project, test_id, name, file_path, discovered_at) VALUES ('', ?, ?, ?, ?)`,
            [testId, testId, filePath, new Date().toISOString()]
        )

    // Replaces the real spawn: records argv, returns a child that never exits until closed.
    const fakeSpawn = () => {
        const playwright = server.serviceContainer.playwrightService as any
        vi.spyOn(playwright, 'spawnPlaywrightProcess').mockImplementation(((args: string[]) => {
            spawnArgs.push(args)
            const child = new EventEmitter() as EventEmitter & {pid?: number}
            spawned.push(child)
            return child
        }) as any)
    }

    beforeAll(async () => {
        server = await setupTestServer()
    })
    afterAll(async () => {
        await teardownTestServer(server)
    })
    beforeEach(async () => {
        await cleanDatabase(server.testRepository)
        vi.restoreAllMocks()
        activeProcessesTracker.forceReset()
        spawnArgs = []
        spawned = []
        await catalog(ORDERS, 'test-orders')
        await catalog(PURCHASE, 'test-purchase')
    })
    afterEach(() => {
        for (const child of spawned) child.emit('close', 0)
        activeProcessesTracker.forceReset()
    })

    describe('run-group file filter', () => {
        it.each([
            ['match-everything pattern', '.*'],
            ['substring of a known path', 'create.spec.ts'],
            ['suffix of a known path', 'orders/create'],
            ['case variant of a known path', 'ORDERS/create.spec.ts'],
            ['alternation', `${ORDERS}|${PURCHASE}`],
            ['unknown file', 'orders/missing.spec.ts'],
        ])('rejects %s with 400 and spawns nothing', async (_name, filePath) => {
            fakeSpawn()
            const res = await api().post('/api/tests/run-group').send({filePath}).expect(400)

            expect(res.body.message).toContain('Unknown spec file')
            expect(spawnArgs).toHaveLength(0)
        })

        it('passes an anchored pattern that selects exactly the requested file', async () => {
            fakeSpawn()
            await api().post('/api/tests/run-group').send({filePath: ORDERS}).expect(200)

            const filter = spawnArgs[0][2]
            expect(filter).toBe('/(^|\\/)(orders\\/create\\.spec\\.ts)$/')
            // Playwright turns a /body/ argument into new RegExp(body) and tests it on the absolute path
            const re = new RegExp(filter.slice(1, -1))
            expect(re.test('/proj/e2e/tests/orders/create.spec.ts')).toBe(true)
            expect(re.test('/proj/e2e/tests/purchase-orders/create.spec.ts')).toBe(false)
            expect(re.test('/proj/e2e/tests/ORDERS/create.spec.ts')).toBe(false)
        })

        it('accepts a path known only from stored results', async () => {
            await seedTestRuns(server.testRepository.dbManager, [{id: 'r1', status: 'completed'}])
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES ('e1', 'test-x', 'r1', 'x', 'only/in/results.spec.ts', 'passed', 1)`
            )
            fakeSpawn()
            await api()
                .post('/api/tests/run-group')
                .send({filePath: 'only/in/results.spec.ts'})
                .expect(200)
        })
    })

    describe('rerun file filter', () => {
        it('anchors the file of the rerun test', async () => {
            await seedTestRuns(server.testRepository.dbManager, [{id: 'r1', status: 'completed'}])
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES ('e1', 'test-orders', 'r1', 'make it', ?, 'failed', 1)`,
                [ORDERS]
            )
            fakeSpawn()
            await api().post('/api/tests/e1/rerun').send({}).expect(200)

            expect(spawnArgs[0][2]).toBe('/(^|\\/)(orders\\/create\\.spec\\.ts)$/')
        })
    })

    describe('rerun title grep', () => {
        it('passes the grep as a /body/ without flags (case-sensitive)', async () => {
            await seedTestRuns(server.testRepository.dbManager, [{id: 'r1', status: 'completed'}])
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES ('e1', 'test-orders', 'r1', 'Create invoice', ?, 'failed', 1)`,
                [ORDERS]
            )
            fakeSpawn()
            await api().post('/api/tests/e1/rerun').send({}).expect(200)

            const grep = spawnArgs[0][spawnArgs[0].indexOf('--grep') + 1]
            expect(grep.startsWith('/') && grep.endsWith('/')).toBe(true)
            const re = new RegExp(grep.slice(1, -1))
            expect(re.test('p orders/create.spec.ts Create invoice')).toBe(true)
            expect(re.test('p orders/create.spec.ts create invoice')).toBe(false)
        })
    })

    describe('maxWorkers', () => {
        const bad: unknown[] = [0, -1, 17, 2.5, '4', 1e9, true, [], {}]
        const routes = [
            ['run-all', '/api/tests/run-all', {}],
            ['run-group', '/api/tests/run-group', {filePath: ORDERS}],
            ['rerun', '/api/tests/e1/rerun', {}],
            ['pipeline', '/api/pipeline/run', {pipeline: 'develop'}],
        ] as const

        beforeEach(async () => {
            await seedTestRuns(server.testRepository.dbManager, [{id: 'r1', status: 'completed'}])
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES ('e1', 'test-orders', 'r1', 'make it', ?, 'failed', 1)`,
                [ORDERS]
            )
        })

        for (const [name, url, body] of routes) {
            it(`${name}: rejects out-of-range or non-integer values with 400`, async () => {
                fakeSpawn()
                for (const maxWorkers of bad) {
                    const res = await api()
                        .post(url)
                        .send({...body, maxWorkers})
                    expect(res.status, `${JSON.stringify(maxWorkers)}`).toBe(400)
                    expect(res.body.message).toContain('maxWorkers')
                }
                expect(spawnArgs).toHaveLength(0)
            })
        }

        it('run-group: passes the bounds 1 and 16 to --workers', async () => {
            fakeSpawn()
            await api()
                .post('/api/tests/run-group')
                .send({filePath: ORDERS, maxWorkers: 16})
                .expect(200)
            expect(spawnArgs[0]).toContain('--workers=16')
            for (const c of spawned) c.emit('close', 0)

            await api()
                .post('/api/tests/run-group')
                .send({filePath: ORDERS, maxWorkers: 1})
                .expect(200)
            expect(spawnArgs[1]).toContain('--workers=1')
        })
    })

    describe('discovery busy guard', () => {
        it('answers 409 TESTS_ALREADY_RUNNING to a reset discovery while a run is active', async () => {
            const discover = vi
                .spyOn(server.serviceContainer.playwrightService as any, 'discoverTests')
                .mockResolvedValue([])
            fakeSpawn()
            await api().post('/api/tests/run-group').send({filePath: ORDERS}).expect(200)

            for (const body of [{}, {mode: 'reset'}, {mode: 'reset', project: 'P'}]) {
                const res = await api().post('/api/tests/discovery').send(body).expect(409)
                expect(res.body).toMatchObject({success: false, code: 'TESTS_ALREADY_RUNNING'})
            }
            expect(discover).not.toHaveBeenCalled()
        })

        it('still allows incremental discovery while busy, and reset when idle', async () => {
            const discover = vi
                .spyOn(server.serviceContainer.playwrightService as any, 'discoverTests')
                .mockResolvedValue([])
            await api().post('/api/tests/discovery').send({}).expect(200)

            fakeSpawn()
            await api().post('/api/tests/run-group').send({filePath: ORDERS}).expect(200)
            await api().post('/api/tests/discovery').send({mode: 'incremental'}).expect(200)
            expect(discover).toHaveBeenCalledTimes(2)
        })
    })

    describe('force-reset', () => {
        const live: Array<ReturnType<typeof spawn>> = []
        afterEach(() => {
            for (const child of live.splice(0)) {
                if (child.pid) {
                    try {
                        process.kill(-child.pid, 'SIGKILL')
                    } catch {
                        // already gone
                    }
                }
            }
        })

        const deadPid = async (): Promise<number> => {
            const child = spawn(process.execPath, ['-e', ''])
            await new Promise((resolve) => child.once('close', resolve))
            return child.pid!
        }

        it('drops a registry entry whose process is gone and frees the dashboard', async () => {
            const stuck = new EventEmitter() as any
            stuck.pid = await deadPid()
            stuck.exitCode = null
            stuck.signalCode = null
            runProcessRegistry.register({runId: 'stuck-run', type: 'run-group'}, stuck)
            expect(runProcessRegistry.has('stuck-run')).toBe(true)
            await api().post('/api/tests/run-group').send({filePath: ORDERS}).expect(409)

            const res = await api().post('/api/tests/force-reset').send({}).expect(200)

            expect(res.body.data.deadRunsCleared).toEqual(['stuck-run'])
            expect(runProcessRegistry.has('stuck-run')).toBe(false)
            fakeSpawn()
            await api().post('/api/tests/run-group').send({filePath: ORDERS}).expect(200)
        })

        it('keeps an entry whose leader exited but whose workers are still alive', async () => {
            // npx-like leader: exits at once, its worker (same process group) lives on
            const child = spawn('sh', ['-c', 'sleep 30 & exit 0'], {
                detached: true,
                stdio: ['ignore', 'pipe', 'pipe'],
            })
            live.push(child)
            runProcessRegistry.register({runId: 'leader-gone', type: 'run-group'}, child)
            await new Promise((resolve) => child.once('exit', resolve))

            const res = await api().post('/api/tests/force-reset').send({}).expect(200)

            expect(res.body.data.deadRunsCleared).toEqual([])
            expect(runProcessRegistry.has('leader-gone')).toBe(true)
            await api().post('/api/tests/run-group').send({filePath: ORDERS}).expect(409)
        })

        it('treats EPERM from the liveness probe as alive', async () => {
            const stuck = new EventEmitter() as any
            stuck.pid = await deadPid()
            stuck.exitCode = null
            stuck.signalCode = null
            runProcessRegistry.register({runId: 'eperm-run', type: 'run-group'}, stuck)
            const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
                throw Object.assign(new Error('not permitted'), {code: 'EPERM'})
            })
            try {
                expect(runProcessRegistry.clearDead()).toEqual([])
            } finally {
                kill.mockRestore()
            }
            expect(runProcessRegistry.has('eperm-run')).toBe(true)
            stuck.emit('close', 0)
            expect(runProcessRegistry.clearDead()).toEqual([])
        })

        it('never touches an entry whose process is alive', async () => {
            const child = spawn('sleep', ['30'], {detached: true, stdio: 'ignore'})
            live.push(child)
            runProcessRegistry.register({runId: 'live-run', type: 'run-group'}, child)

            const res = await api().post('/api/tests/force-reset').send({}).expect(200)

            expect(res.body.data.deadRunsCleared).toEqual([])
            expect(runProcessRegistry.has('live-run')).toBe(true)
            expect(() => process.kill(child.pid!, 0)).not.toThrow()
            await api().post('/api/tests/run-group').send({filePath: ORDERS}).expect(409)
        })
    })
})

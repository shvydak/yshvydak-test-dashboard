/**
 * Stop (integration): real app, real SQLite, real attachment storage; only Playwright is faked.
 *
 * A stopped run counts as never run: everything it wrote is deleted and each test shows its
 * previous latest result again. Same for CI pipelines (every step, finished ones too) and manual runs.
 */

import {describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi} from 'vitest'
import type {MockInstance} from 'vitest'
import request from 'supertest'
import {EventEmitter} from 'events'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type {TestServerInstance} from '../helpers/testServer'
import {setupTestServer, teardownTestServer, cleanDatabase} from '../helpers/testServer'
import {activeProcessesTracker} from '../../../services/activeProcesses.service'
import {CINotifierService} from '../../../services/ciNotifier.service'
import {config} from '../../../config/environment.config'

const OLD = '2026-01-01T08:00:00.000Z'

const flush = () => new Promise((resolve) => setImmediate(resolve))

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 3000) {
    const started = Date.now()
    while (!(await condition())) {
        if (Date.now() - started > timeoutMs) throw new Error('waitFor timed out')
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
}

describe('Stop a run (Integration)', () => {
    let server: TestServerInstance
    let children: Record<string, EventEmitter & {kill: any}>
    let spawned: string[]
    let tmpDir: string
    let originalEnableAuth: string | undefined
    let notifyStopped: MockInstance<any>
    let notifyResult: MockInstance<any>

    const api = () => ({
        post: (url: string) =>
            request(server.app).post(url).set('Authorization', `Bearer ${server.authToken}`),
        get: (url: string) =>
            request(server.app).get(url).set('Authorization', `Bearer ${server.authToken}`),
        put: (url: string) =>
            request(server.app).put(url).set('Authorization', `Bearer ${server.authToken}`),
    })
    const db = () => server.testRepository.dbManager

    const discovered = (project: string, names: string[]) =>
        names.map((name) => ({
            id: `disc-${project}-${name}-${Math.random().toString(36).slice(2)}`,
            testId: `test-${name}`,
            runId: null,
            name,
            filePath: `${project}/${name}.spec.ts`,
            status: 'pending',
            duration: 0,
            project,
            metadata: {},
            timestamp: new Date().toISOString(),
        }))

    // The Playwright reporter's calls
    const reporter = {
        processStart: (runId: string) =>
            api().post('/api/tests/process-start').send({runId, type: 'run-all', totalTests: 2}),
        testStart: (runId: string, testId: string) =>
            api()
                .post('/api/tests/test-start')
                .send({runId, testId, name: testId, filePath: 'x.spec.ts'}),
        result: (
            runId: string,
            id: string,
            testId: string,
            project: string,
            status: string,
            attachments?: unknown[]
        ) =>
            api()
                .post('/api/tests')
                .send({
                    id,
                    runId,
                    testId,
                    name: testId.replace('test-', ''),
                    filePath: `${project}/${testId.replace('test-', '')}.spec.ts`,
                    status,
                    duration: 5,
                    project,
                    timestamp: new Date().toISOString(),
                    attachments,
                }),
        runDone: (runId: string, passed: number, failed: number) =>
            api()
                .put(`/api/runs/${runId}`)
                .send({
                    status: failed > 0 ? 'failed' : 'completed',
                    totalTests: passed + failed,
                    passedTests: passed,
                    failedTests: failed,
                }),
    }

    const latestStatus = async (testId: string) =>
        (await db().queryOne(
            'SELECT status, run_id FROM test_results WHERE test_id = ? ORDER BY created_at DESC LIMIT 1',
            [testId]
        )) as {status: string; run_id: string | null}

    const seedPreviousResults = async () => {
        await db().execute(
            `INSERT INTO test_runs (id, status, total_tests, passed_tests, failed_tests) VALUES ('prev-run', 'completed', 3, 2, 1)`
        )
        const rows: Array<[string, string, string, string]> = [
            ['prev-t1', 'test-t1', 'passed', 'API'],
            ['prev-t2', 'test-t2', 'failed', 'API'],
            ['prev-t3', 'test-t3', 'passed', 'WEB'],
        ]
        for (const [id, testId, status, project] of rows) {
            await db().execute(
                `INSERT INTO test_results (id, run_id, test_id, name, file_path, status, project, created_at, updated_at)
                 VALUES (?, 'prev-run', ?, ?, ?, ?, ?, ?, ?)`,
                [id, testId, testId, `${project}/${testId}.spec.ts`, status, project, OLD, OLD]
            )
        }
    }

    const configureTabs = () =>
        server.serviceContainer.settingsService.setProjectTabConfigs([
            {
                project: 'API',
                displayName: 'API',
                visible: true,
                pipelines: ['develop'],
                stopPipelineOnFailure: false,
            },
            {
                project: 'WEB',
                displayName: 'WEB',
                visible: true,
                pipelines: ['develop'],
                stopPipelineOnFailure: false,
            },
        ])

    // Playwright fake: discovery returns fixed tests; a run is a child that dies on SIGINT.
    const fakePlaywright = (discoveryByProject: Record<string, string[]>) => {
        const playwright = server.serviceContainer.playwrightService as any
        vi.spyOn(playwright, 'discoverTests').mockImplementation((async (project?: string) =>
            project ? discovered(project, discoveryByProject[project] ?? []) : []) as any)
        vi.spyOn(playwright, 'runAllTests').mockImplementation((async (
            _workers: unknown,
            project?: string
        ) => {
            const runId = `run-${project ?? 'all'}-${spawned.length + 1}`
            const child = new EventEmitter() as EventEmitter & {kill: any}
            child.kill = vi.fn((signal: string) => {
                setImmediate(() => child.emit('close', null, signal))
                return true
            })
            children[runId] = child
            spawned.push(runId)
            return {
                runId,
                message: 'started',
                timestamp: new Date().toISOString(),
                process: child,
            }
        }) as any)
    }

    beforeAll(async () => {
        // Stop sits behind JWT; the other tests send the token, so auth must be on whatever .env says.
        originalEnableAuth = process.env.ENABLE_AUTH
        process.env.ENABLE_AUTH = 'true'
        server = await setupTestServer()
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-run-'))
    })

    afterAll(async () => {
        if (originalEnableAuth === undefined) delete process.env.ENABLE_AUTH
        else process.env.ENABLE_AUTH = originalEnableAuth
        await teardownTestServer(server)
        fs.rmSync(tmpDir, {recursive: true, force: true})
    })

    beforeEach(async () => {
        vi.restoreAllMocks()
        await cleanDatabase(server.testRepository)
        await db().execute('DELETE FROM app_settings')
        activeProcessesTracker.forceReset()
        children = {}
        spawned = []
        notifyStopped = vi.spyOn(CINotifierService.prototype, 'notifyStopped')
        notifyStopped.mockResolvedValue(undefined)
        notifyResult = vi.spyOn(CINotifierService.prototype, 'notifyResult')
        notifyResult.mockResolvedValue(undefined)
        await configureTabs()
        await seedPreviousResults()
    })

    afterEach(async () => {
        // Let any run still alive end so the next test starts idle.
        for (let i = 0; i < 5; i++) {
            Object.values(children).forEach((child) => child.emit('close', 0))
            await flush()
        }
        activeProcessesTracker.forceReset()
    })

    describe('a CI pipeline', () => {
        it('stop deletes every step (finished ones too), the discovery takeover and the attachments; previous results show again', async () => {
            fakePlaywright({API: ['t1', 't2', 't4'], WEB: ['t3']})
            const trace = path.join(tmpDir, 'trace.zip')
            fs.writeFileSync(trace, 'zip-bytes')

            await api()
                .post('/api/pipeline/run')
                .send({pipeline: 'develop', source: 'script', notify: true})
                .expect(200)
            await waitFor(() => spawned.length === 1)
            const apiRun = spawned[0]

            // Step 1 (API) reports and finishes.
            await reporter.processStart(apiRun).expect(200)
            await reporter.testStart(apiRun, 'test-t1').expect(200)
            await reporter
                .result(apiRun, 'new-t1', 'test-t1', 'API', 'failed', [
                    {name: 'trace', path: trace, contentType: 'application/zip'},
                ])
                .expect(200)
            await reporter.result(apiRun, 'new-t2', 'test-t2', 'API', 'passed').expect(200)
            await reporter.runDone(apiRun, 1, 1).expect(200)
            children[apiRun].emit('close', 0)

            // Step 2 (WEB) starts and writes a result.
            await waitFor(() => spawned.length === 2)
            const webRun = spawned[1]
            await reporter.result(webRun, 'new-t3', 'test-t3', 'WEB', 'failed').expect(200)

            const attachment = await db().queryOne(
                'SELECT file_path FROM attachments WHERE test_result_id = ?',
                ['new-t1']
            )
            expect(fs.existsSync(attachment.file_path)).toBe(true)
            // Mid-run the new results are the latest ones.
            expect((await latestStatus('test-t1')).status).toBe('failed')

            const stop = await api().post('/api/pipeline/stop').send({reason: 'manual'}).expect(200)

            expect(stop.body.data).toMatchObject({stopped: true, reason: 'manual'})
            expect(stop.body.data.runIds.sort()).toEqual([apiRun, webRun].sort())
            expect(children[webRun].kill).toHaveBeenCalledWith('SIGINT')

            // Everything the pipeline wrote is gone: both steps, rows, attachments.
            const left = await db().queryAll('SELECT id FROM test_results WHERE run_id IN (?, ?)', [
                apiRun,
                webRun,
            ])
            expect(left).toEqual([])
            expect(
                await db().queryAll('SELECT id FROM test_runs WHERE id IN (?, ?)', [apiRun, webRun])
            ).toEqual([])
            expect(await db().queryAll('SELECT id FROM attachments')).toEqual([])
            expect(fs.existsSync(attachment.file_path)).toBe(false)

            // Each test shows its previous latest result again - no "pending" takeover from discovery.
            expect(await latestStatus('test-t1')).toMatchObject({
                status: 'passed',
                run_id: 'prev-run',
            })
            expect(await latestStatus('test-t2')).toMatchObject({
                status: 'failed',
                run_id: 'prev-run',
            })
            expect(await latestStatus('test-t3')).toMatchObject({
                status: 'passed',
                run_id: 'prev-run',
            })
            // A test that never ran keeps its pending row.
            expect(await latestStatus('test-t4')).toMatchObject({status: 'pending', run_id: null})

            // The previous run and its row are untouched.
            const prev = await db().queryAll('SELECT id FROM test_results WHERE run_id = ?', [
                'prev-run',
            ])
            expect(prev).toHaveLength(3)

            const status = await api().get('/api/pipeline/status/current').expect(200)
            expect(status.body.data.status).toBe('cancelled')
            expect(status.body.stopping).toBe(false)
            expect(notifyStopped).toHaveBeenCalledTimes(1)
            expect(notifyResult).not.toHaveBeenCalled()
            // No ghost "running" entry, no marker left behind.
            expect(activeProcessesTracker.isProcessRunning(apiRun)).toBe(false)
            expect(activeProcessesTracker.isProcessRunning(webRun)).toBe(false)
            expect(await server.serviceContainer.settingsService.getInFlightPipeline()).toBeNull()
            expect(await server.serviceContainer.settingsService.getInFlightRun()).toBeNull()
        })

        it('late reporter posts for the stopped run are acknowledged but ignored', async () => {
            fakePlaywright({API: ['t1'], WEB: ['t3']})
            await api()
                .post('/api/pipeline/run')
                .send({pipeline: 'develop', source: 'script'})
                .expect(200)
            await waitFor(() => spawned.length === 1)
            const apiRun = spawned[0]
            await api().post('/api/pipeline/stop').send({}).expect(200)

            // Playwright's SIGINT teardown still reports.
            const processStart = await reporter.processStart(apiRun).expect(200)
            await reporter.testStart(apiRun, 'test-t1').expect(200)
            const late = await reporter.result(apiRun, 'late-t1', 'test-t1', 'API', 'failed')
            await reporter.runDone(apiRun, 0, 1)

            expect(processStart.body.message).toMatch(/ignored/i)
            expect(late.status).toBe(200)
            expect(
                await db().queryAll('SELECT id FROM test_results WHERE id = ?', ['late-t1'])
            ).toEqual([])
            expect(activeProcessesTracker.isProcessRunning(apiRun)).toBe(false)
            expect(await latestStatus('test-t1')).toMatchObject({
                status: 'passed',
                run_id: 'prev-run',
            })
        })

        it('stop during discovery of step 1: no child is ever spawned and the discovery rows are undone', async () => {
            fakePlaywright({API: ['t1', 't2']})
            const playwright = server.serviceContainer.playwrightService as any
            let finishDiscovery!: () => void
            playwright.discoverTests.mockImplementation(
                (project: string) =>
                    new Promise((resolve) => {
                        finishDiscovery = () => resolve(discovered(project, ['t1', 't2']))
                    })
            )

            await api()
                .post('/api/pipeline/run')
                .send({pipeline: 'develop', source: 'script'})
                .expect(200)
            await waitFor(() => typeof finishDiscovery === 'function')

            const stop = api().post('/api/pipeline/stop').send({})
            const stopped = stop.then((res) => res)
            await new Promise((resolve) => setTimeout(resolve, 100))
            // Still waiting for the discovery to unwind.
            finishDiscovery()
            const response = await stopped

            expect(response.status).toBe(200)
            expect(response.body.data.stopped).toBe(true)
            expect(spawned).toEqual([])
            expect(await latestStatus('test-t1')).toMatchObject({
                status: 'passed',
                run_id: 'prev-run',
            })
            expect(await latestStatus('test-t2')).toMatchObject({
                status: 'failed',
                run_id: 'prev-run',
            })
            const status = await api().get('/api/pipeline/status/current').expect(200)
            expect(status.body.data.status).toBe('cancelled')
        })

        it('stop between steps: step 2 never spawns, step 1 is deleted', async () => {
            fakePlaywright({API: ['t1', 't2'], WEB: ['t3']})
            const playwright = server.serviceContainer.playwrightService as any
            const realRun = playwright.runAllTests.getMockImplementation()
            const webDiscovery = {finish: undefined as undefined | (() => void)}
            playwright.discoverTests.mockImplementation(async (project: string) => {
                if (project === 'WEB') {
                    await new Promise<void>((resolve) => (webDiscovery.finish = resolve))
                }
                return discovered(project, project === 'API' ? ['t1', 't2'] : ['t3'])
            })
            playwright.runAllTests.mockImplementation(realRun)

            await api()
                .post('/api/pipeline/run')
                .send({pipeline: 'develop', source: 'script'})
                .expect(200)
            await waitFor(() => spawned.length === 1)
            const apiRun = spawned[0]
            await reporter.result(apiRun, 'new-t1', 'test-t1', 'API', 'failed').expect(200)
            await reporter.runDone(apiRun, 0, 1).expect(200)
            children[apiRun].emit('close', 0)
            await waitFor(() => typeof webDiscovery.finish === 'function')

            const stopped = api()
                .post('/api/pipeline/stop')
                .send({})
                .then((res) => res)
            await new Promise((resolve) => setTimeout(resolve, 50))
            webDiscovery.finish!()
            const response = await stopped

            expect(response.body.data.stopped).toBe(true)
            expect(spawned).toEqual([apiRun])
            expect(
                await db().queryAll('SELECT id FROM test_results WHERE run_id = ?', [apiRun])
            ).toEqual([])
            expect(await latestStatus('test-t1')).toMatchObject({
                status: 'passed',
                run_id: 'prev-run',
            })
            expect(await latestStatus('test-t3')).toMatchObject({
                status: 'passed',
                run_id: 'prev-run',
            })
        })
    })

    describe('a manual run', () => {
        it('Run All started from the UI (discovery in its own request): stop removes the results and the discovery takeover', async () => {
            fakePlaywright({API: ['t1', 't2']})
            // The UI discovers first: the new pending rows hide the previous results.
            await api().post('/api/tests/discovery').send({project: 'API'}).expect(200)
            expect((await latestStatus('test-t1')).status).toBe('pending')

            const run = await api()
                .post('/api/tests/run-all')
                .send({project: 'API', skipAutoDiscovery: true})
                .expect(200)
            const runId = run.body.data.runId
            await reporter.processStart(runId).expect(200)
            await reporter.result(runId, 'new-t1', 'test-t1', 'API', 'passed').expect(200)
            expect(await server.serviceContainer.settingsService.getInFlightRun()).toMatchObject({
                runId,
            })

            const stop = await api().post('/api/pipeline/stop').send({reason: 'manual'}).expect(200)

            expect(stop.body.data).toMatchObject({stopped: true, runIds: [runId]})
            expect(await db().queryAll('SELECT id FROM test_runs WHERE id = ?', [runId])).toEqual(
                []
            )
            expect(await latestStatus('test-t1')).toMatchObject({
                status: 'passed',
                run_id: 'prev-run',
            })
            expect(await latestStatus('test-t2')).toMatchObject({
                status: 'failed',
                run_id: 'prev-run',
            })
            expect(activeProcessesTracker.isProcessRunning(runId)).toBe(false)
            expect(await server.serviceContainer.settingsService.getInFlightRun()).toBeNull()
            // A manual run posts nothing to Slack.
            expect(notifyStopped).not.toHaveBeenCalled()
        })

        it('Run All with auto-discover off: Stop leaves the old placeholder rows it never wrote', async () => {
            fakePlaywright({API: ['t1', 't2']})
            // A placeholder from some earlier discovery days ago; the run starts without discovering.
            await db().execute(
                `INSERT INTO test_results (id, run_id, test_id, name, file_path, status, project, created_at, updated_at)
                 VALUES ('old-pending-t1', NULL, 'test-t1', 't1', 'API/t1.spec.ts', 'pending', 'API', '2026-01-02T08:00:00.000Z', '2026-01-02T08:00:00.000Z')`
            )
            expect((await latestStatus('test-t1')).status).toBe('pending')

            const run = await api()
                .post('/api/tests/run-all')
                .send({project: 'API', skipAutoDiscovery: true})
                .expect(200)
            await reporter.result(run.body.data.runId, 'new-t1', 'test-t1', 'API', 'passed')
            await api().post('/api/pipeline/stop').send({}).expect(200)

            expect(await latestStatus('test-t1')).toMatchObject({status: 'pending', run_id: null})
            expect(
                await db().queryAll(`SELECT id FROM test_results WHERE id = 'old-pending-t1'`)
            ).toHaveLength(1)
            expect(
                await db().queryAll('SELECT id FROM test_results WHERE run_id = ?', [
                    run.body.data.runId,
                ])
            ).toEqual([])
        })

        it('the dashboard is free again after a stop: a new run starts at once', async () => {
            fakePlaywright({API: ['t1']})
            await api()
                .post('/api/tests/run-all')
                .send({project: 'API', skipAutoDiscovery: true})
                .expect(200)
            await api().post('/api/pipeline/stop').send({}).expect(200)

            await api()
                .post('/api/tests/run-all')
                .send({project: 'API', skipAutoDiscovery: true})
                .expect(200)
        })

        it('stopping a group run deletes its results', async () => {
            const playwright = server.serviceContainer.playwrightService as any
            const child = new EventEmitter() as EventEmitter & {kill: any}
            child.kill = vi.fn(() => {
                setImmediate(() => child.emit('close', null, 'SIGINT'))
                return true
            })
            children['group-run'] = child
            vi.spyOn(playwright, 'runTestGroup').mockResolvedValue({
                runId: 'group-run',
                message: 'started',
                timestamp: new Date().toISOString(),
                process: child,
            })
            await api().post('/api/tests/run-group').send({filePath: 'API/t1.spec.ts'}).expect(200)
            await reporter.result('group-run', 'grp-t1', 'test-t1', 'API', 'failed').expect(200)

            await api().post('/api/pipeline/stop').send({}).expect(200)

            expect(
                await db().queryAll('SELECT id FROM test_results WHERE run_id = ?', ['group-run'])
            ).toEqual([])
            expect(await latestStatus('test-t1')).toMatchObject({
                status: 'passed',
                run_id: 'prev-run',
            })
        })
    })

    describe('POST /api/pipeline/stop', () => {
        afterEach(() => {
            process.env.ENABLE_AUTH = 'true'
        })

        it('with nothing running answers 200 stopped:false and changes nothing', async () => {
            const response = await api().post('/api/pipeline/stop').send({}).expect(200)

            expect(response.body.data).toEqual({stopped: false, runIds: []})
            expect(await latestStatus('test-t1')).toMatchObject({status: 'passed'})
        })

        it('requires a JWT: 401 without a token and with a bad one', async () => {
            await request(server.app).post('/api/pipeline/stop').send({}).expect(401)
            await request(server.app)
                .post('/api/pipeline/stop')
                .set('Authorization', 'Bearer not-a-token')
                .send({})
                .expect(401)
            await request(server.app)
                .post('/api/pipeline/stop')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({})
                .expect(200)
        })

        it('is refused (403) when authentication is disabled, like /api/settings/*', async () => {
            process.env.ENABLE_AUTH = 'false'
            expect(config.auth.enableAuth).toBe(false)

            await request(server.app).post('/api/pipeline/stop').send({}).expect(403)
        })

        it('does not stop anything when the request is rejected', async () => {
            fakePlaywright({API: ['t1']})
            await api()
                .post('/api/tests/run-all')
                .send({project: 'API', skipAutoDiscovery: true})
                .expect(200)

            await request(server.app).post('/api/pipeline/stop').send({}).expect(401)

            expect(Object.values(children)[0].kill).not.toHaveBeenCalled()
        })

        it('only accepts reason manual over HTTP', async () => {
            await api().post('/api/pipeline/stop').send({reason: 'replaced'}).expect(400)
        })
    })

    describe('restart cleanup', () => {
        it('deletes the marker runs only; old stuck "running" rows with history are left alone', async () => {
            // History: an old run stuck in "running" with results (like the local dev database).
            await db().execute(`INSERT INTO test_runs (id, status) VALUES ('old-stuck', 'running')`)
            await db().execute(
                `INSERT INTO test_results (id, run_id, test_id, name, file_path, status, project, created_at, updated_at)
                 VALUES ('stuck-1', 'old-stuck', 'test-t1', 't1', 'API/t1.spec.ts', 'passed', 'API', ?, ?)`,
                [OLD, OLD]
            )
            // The interrupted run.
            await db().execute(
                `INSERT INTO test_runs (id, status) VALUES ('interrupted-1', 'running')`
            )
            await db().execute(
                `INSERT INTO test_results (id, run_id, test_id, name, file_path, status, project, created_at, updated_at)
                 VALUES ('int-1', 'interrupted-1', 'test-t1', 't1', 'API/t1.spec.ts', 'failed', 'API', ?, ?)`,
                [new Date().toISOString(), new Date().toISOString()]
            )
            await server.serviceContainer.settingsService.setInFlightPipeline({
                pipeline: 'develop',
                source: 'script',
                notify: false,
                startedAt: new Date(Date.now() - 60_000).toISOString(),
                runIds: ['interrupted-1'],
                projects: ['API'],
                pgids: [],
            })

            await server.serviceContainer.pipelineExecutionService.handleInterruptedOnStartup()

            expect(
                await db().queryAll(`SELECT id FROM test_results WHERE run_id = 'interrupted-1'`)
            ).toEqual([])
            expect(
                await db().queryAll(`SELECT id FROM test_runs WHERE id = 'interrupted-1'`)
            ).toEqual([])
            expect(
                await db().queryAll(`SELECT id FROM test_results WHERE id = 'stuck-1'`)
            ).toHaveLength(1)
            expect(
                await db().queryAll(`SELECT id FROM test_runs WHERE id = 'old-stuck'`)
            ).toHaveLength(1)
            expect(await server.serviceContainer.settingsService.getInFlightPipeline()).toBeNull()
        })
    })
})

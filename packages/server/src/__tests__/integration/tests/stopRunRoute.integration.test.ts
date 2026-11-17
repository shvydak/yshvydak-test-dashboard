/**
 * POST /api/runs/:id/stop (integration): real app and SQLite, Playwright faked by EventEmitter children.
 * :id is a runId or a pipelineRunId; a pipeline step stops the whole pipeline; the id is resolved to the
 * live target and the stop starts in the same tick, so a run that just ended can never stop the next one.
 */

import {describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi} from 'vitest'
import type {MockInstance} from 'vitest'
import request from 'supertest'
import {EventEmitter} from 'events'
import type {TestServerInstance} from '../helpers/testServer'
import {setupTestServer, teardownTestServer, cleanDatabase} from '../helpers/testServer'
import {activeProcessesTracker} from '../../../services/activeProcesses.service'
import {runProcessRegistry} from '../../../services/runProcessRegistry.service'
import {CINotifierService} from '../../../services/ciNotifier.service'
import {config} from '../../../config/environment.config'

const rand = () => Math.random().toString(36).slice(2, 8)
const flush = () => new Promise((resolve) => setImmediate(resolve))

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 3000) {
    const started = Date.now()
    while (!(await condition())) {
        if (Date.now() - started > timeoutMs) throw new Error('waitFor timed out')
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
}

describe('POST /api/runs/:id/stop (Integration)', () => {
    let server: TestServerInstance
    let children: Record<string, EventEmitter & {kill: any}>
    let spawned: string[]
    let originalEnableAuth: string | undefined
    let notifyStopped: MockInstance<any>

    const api = () => ({
        post: (url: string) =>
            request(server.url).post(url).set('Authorization', `Bearer ${server.authToken}`),
        get: (url: string) =>
            request(server.url).get(url).set('Authorization', `Bearer ${server.authToken}`),
        put: (url: string) =>
            request(server.url).put(url).set('Authorization', `Bearer ${server.authToken}`),
    })
    const db = () => server.testRepository.dbManager
    const runRow = async (runId: string) =>
        (await db().queryOne('SELECT * FROM test_runs WHERE id = ?', [runId])) as any

    const discovered = (project: string, names: string[]) =>
        names.map((name) => ({
            id: `disc-${project}-${name}-${rand()}`,
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

    const spawnedRun = async (n: number) => {
        await waitFor(() => spawned.length === n)
        const runId = spawned[n - 1]
        await waitFor(async () => !!(await runRow(runId)))
        return runId
    }

    const reporterResult = (runId: string, id: string, testId: string, project: string) =>
        api()
            .post('/api/tests')
            .send({
                id,
                runId,
                testId,
                name: testId,
                filePath: `${project}/${testId}.spec.ts`,
                status: 'passed',
                duration: 5,
                project,
                timestamp: new Date().toISOString(),
            })

    const tab = (project: string) => ({
        project,
        displayName: project,
        visible: true,
        pipelines: ['develop' as const],
        stopPipelineOnFailure: false,
    })

    // Discovery returns fixed tests; a run is a child that dies on SIGINT.
    const fakePlaywright = (discoveryByProject: Record<string, string[]>) => {
        const playwright = server.serviceContainer.playwrightService as any
        vi.spyOn(playwright, 'discoverTests').mockImplementation((async (project?: string) =>
            project ? discovered(project, discoveryByProject[project] ?? []) : []) as any)
        vi.spyOn(playwright, 'runAllTests').mockImplementation((async (
            _workers: unknown,
            project?: string
        ) => {
            const runId = `run-${project ?? 'all'}-${spawned.length + 1}-${rand()}`
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

    const startRunAll = async (project: string) => {
        const res = await api()
            .post('/api/tests/run-all')
            .send({project, skipAutoDiscovery: true})
            .expect(200)
        return res.body.data.runId as string
    }

    beforeAll(async () => {
        originalEnableAuth = process.env.ENABLE_AUTH
        process.env.ENABLE_AUTH = 'true'
        server = await setupTestServer()
    })

    afterAll(async () => {
        if (originalEnableAuth === undefined) delete process.env.ENABLE_AUTH
        else process.env.ENABLE_AUTH = originalEnableAuth
        await teardownTestServer(server)
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
        await server.serviceContainer.settingsService.setProjectTabConfigs([tab('API'), tab('WEB')])
    })

    afterEach(async () => {
        for (let i = 0; i < 5; i++) {
            Object.values(children).forEach((child) => child.emit('close', 0))
            await flush()
        }
        activeProcessesTracker.forceReset()
        process.env.ENABLE_AUTH = 'true'
    })

    it('stops a standalone run by its runId: the saved result stays, the run is marked failed + stopped', async () => {
        fakePlaywright({API: ['t1', 't2']})
        const runId = await startRunAll('API')
        await reporterResult(runId, `new-${rand()}`, 'test-t1', 'API').expect(200)

        const stop = await api().post(`/api/runs/${runId}/stop`).send({}).expect(200)

        expect(stop.body.data).toMatchObject({
            stopped: true,
            reason: 'manual',
            runIds: [runId],
            resultsKept: true,
        })
        expect(children[runId].kill).toHaveBeenCalledWith('SIGINT')
        const row = await runRow(runId)
        expect(row).toMatchObject({status: 'failed', total_tests: 1, passed_tests: 1})
        expect(JSON.parse(row.metadata).stopped.reason).toBe('manual')
        expect(
            await db().queryAll('SELECT id FROM test_results WHERE run_id = ?', [runId])
        ).toHaveLength(1)
    })

    it('a pipeline step runId stops the WHOLE pipeline: the next step never spawns and the pipeline ends cancelled', async () => {
        fakePlaywright({API: ['t1'], WEB: ['t3']})
        const started = await api()
            .post('/api/pipeline/run')
            .send({pipeline: 'develop', source: 'script'})
            .expect(200)
        const pipelineRunId = started.body.data.pipelineRunId
        const stepRun = await spawnedRun(1)

        const stop = await api().post(`/api/runs/${stepRun}/stop`).send({}).expect(200)

        expect(stop.body.data).toMatchObject({
            stopped: true,
            pipelineRunId,
            runIds: [stepRun],
            resultsKept: true,
        })
        expect(spawned).toEqual([stepRun])
        const status = await api().get(`/api/pipeline/status/${pipelineRunId}`).expect(200)
        expect(status.body.data).toMatchObject({
            status: 'cancelled',
            stopReason: 'manual',
            resultsKept: true,
        })
        expect(status.body.data.steps.map((s: any) => s.status)).toEqual(['stopped', 'skipped'])
    })

    it('the pipelineRunId stops it between steps (step 2 still preparing); step 1 keeps its row', async () => {
        fakePlaywright({API: ['t1'], WEB: ['t3']})
        const playwright = server.serviceContainer.playwrightService as any
        const webDiscovery = {finish: undefined as undefined | (() => void)}
        playwright.discoverTests.mockImplementation(async (project: string) => {
            if (project === 'WEB') {
                await new Promise<void>((resolve) => (webDiscovery.finish = resolve))
            }
            return discovered(project, project === 'API' ? ['t1'] : ['t3'])
        })
        const started = await api()
            .post('/api/pipeline/run')
            .send({pipeline: 'develop', source: 'script'})
            .expect(200)
        const pipelineRunId = started.body.data.pipelineRunId
        const apiRun = await spawnedRun(1)
        await reporterResult(apiRun, `new-${rand()}`, 'test-t1', 'API').expect(200)
        await api()
            .put(`/api/runs/${apiRun}`)
            .send({status: 'completed', totalTests: 1, passedTests: 1, failedTests: 0})
            .expect(200)
        children[apiRun].emit('close', 0)
        await waitFor(() => typeof webDiscovery.finish === 'function')
        const step1Before = JSON.stringify(await runRow(apiRun))

        const stopped = api()
            .post(`/api/runs/${pipelineRunId}/stop`)
            .send({})
            .then((res) => res)
        await new Promise((resolve) => setTimeout(resolve, 50))
        webDiscovery.finish!()
        const response = await stopped

        expect(response.status).toBe(200)
        expect(response.body.data).toMatchObject({stopped: true, pipelineRunId})
        expect(spawned).toEqual([apiRun])
        expect(JSON.stringify(await runRow(apiRun))).toBe(step1Before)
    })

    it('two concurrent requests for the same run: one signal; the second joins the stop (200) or finds the run gone (409)', async () => {
        fakePlaywright({API: ['t1']})
        const runId = await startRunAll('API')

        const [a, b] = await Promise.all([
            api().post(`/api/runs/${runId}/stop`).send({}),
            api().post(`/api/runs/${runId}/stop`).send({}),
        ])

        expect([a.status, b.status].sort()[0]).toBe(200)
        expect([a.status, b.status].every((status) => status === 200 || status === 409)).toBe(true)
        expect(children[runId].kill).toHaveBeenCalledTimes(1)
    })

    describe('not active / not found', () => {
        it('nothing running, a known run id: 409 RUN_NOT_ACTIVE and nothing is signalled', async () => {
            fakePlaywright({API: ['t1']})
            const runId = await startRunAll('API')
            await api()
                .put(`/api/runs/${runId}`)
                .send({status: 'completed', totalTests: 1, passedTests: 1, failedTests: 0})
                .expect(200)
            children[runId].emit('close', 0)
            await waitFor(() => !runProcessRegistry.has(runId))

            const res = await api().post(`/api/runs/${runId}/stop`).send({}).expect(409)

            expect(res.body).toMatchObject({code: 'RUN_NOT_ACTIVE', activeRunId: null})
            expect(children[runId].kill).not.toHaveBeenCalled()
            expect((await runRow(runId)).status).toBe('completed')
        })

        it('the run ended and another one is live: 409, and the live run is NOT stopped', async () => {
            fakePlaywright({API: ['t1'], WEB: ['t3']})
            const first = await startRunAll('API')
            await api()
                .put(`/api/runs/${first}`)
                .send({status: 'completed', totalTests: 1, passedTests: 1, failedTests: 0})
                .expect(200)
            children[first].emit('close', 0)
            await waitFor(() => !runProcessRegistry.has(first))
            const second = await startRunAll('WEB')

            const res = await api().post(`/api/runs/${first}/stop`).send({}).expect(409)

            expect(res.body).toMatchObject({code: 'RUN_NOT_ACTIVE', activeRunId: second})
            expect(children[second].kill).not.toHaveBeenCalled()
            expect((await runRow(second)).status).toBe('running')
        })

        it('a finished pipeline (pipelineRunId) is known: 409', async () => {
            fakePlaywright({API: ['t1'], WEB: ['t3']})
            const started = await api()
                .post('/api/pipeline/run')
                .send({pipeline: 'develop', source: 'script'})
                .expect(200)
            const pipelineRunId = started.body.data.pipelineRunId
            await spawnedRun(1)
            await api().post('/api/pipeline/stop').send({}).expect(200)

            const res = await api().post(`/api/runs/${pipelineRunId}/stop`).send({}).expect(409)

            expect(res.body.code).toBe('RUN_NOT_ACTIVE')
        })

        it('an unknown id: 404 RUN_NOT_FOUND', async () => {
            const res = await api()
                .post(`/api/runs/no-such-run-${rand()}/stop`)
                .send({})
                .expect(404)

            expect(res.body.code).toBe('RUN_NOT_FOUND')
        })

        it('an unsafe id: 400', async () => {
            await api().post('/api/runs/a%20b/stop').send({}).expect(400)
        })
    })

    describe('auth', () => {
        it('requires a JWT: 401 without a token and with a bad one; nothing is stopped', async () => {
            fakePlaywright({API: ['t1']})
            const runId = await startRunAll('API')

            await request(server.url).post(`/api/runs/${runId}/stop`).send({}).expect(401)
            await request(server.url)
                .post(`/api/runs/${runId}/stop`)
                .set('Authorization', 'Bearer not-a-token')
                .send({})
                .expect(401)

            expect(children[runId].kill).not.toHaveBeenCalled()
        })

        it('is refused (403) when authentication is disabled, like POST /api/pipeline/stop', async () => {
            process.env.ENABLE_AUTH = 'false'
            expect(config.auth.enableAuth).toBe(false)

            await request(server.url).post(`/api/runs/run-${rand()}/stop`).send({}).expect(403)
        })
    })

    describe('lastStop on GET /api/pipeline/status/current (the stopped banner, for every tab)', () => {
        // Every call is a "tab": a freshly opened or reloaded one reads the same state.
        const current = () => api().get('/api/pipeline/status/current')
        // The registry stamps runs in ms: the next run must start in a later one.
        const nextMs = () => new Promise((resolve) => setTimeout(resolve, 5))

        const stopPipeline = async () => {
            fakePlaywright({API: ['t1'], WEB: ['t3']})
            const started = await api()
                .post('/api/pipeline/run')
                .send({pipeline: 'develop', source: 'script'})
                .expect(200)
            const stepRun = await spawnedRun(1)
            await api().post(`/api/runs/${stepRun}/stop`).send({}).expect(200)
            await nextMs()
            return started.body.data.pipelineRunId as string
        }

        it('a pipeline stop: name, reason, when, steps; a newer run that only runs does not end it, one that ENDS does (also for a tab opened later)', async () => {
            const pipelineRunId = await stopPipeline()

            const afterStop = (await current().expect(200)).body
            expect(afterStop.lastStop).toMatchObject({
                kind: 'pipeline',
                name: 'develop',
                reason: 'manual',
                pipelineRunId,
            })
            expect(typeof afterStop.lastStop.stoppedAt).toBe('string')
            expect(afterStop.lastStop.steps.map((s: any) => s.status)).toEqual([
                'stopped',
                'skipped',
            ])

            const newer = await startRunAll('WEB')
            expect((await current().expect(200)).body.lastStop).not.toBeNull()

            await api()
                .put(`/api/runs/${newer}`)
                .send({status: 'completed', totalTests: 1, passedTests: 1, failedTests: 0})
                .expect(200)
            children[newer].emit('close', 0)
            await waitFor(() => !runProcessRegistry.has(newer))

            // A tab opened now (or a reload) is told the notice is over; the pipeline state stays readable.
            const later = (await current().expect(200)).body
            expect(later.lastStop).toBeNull()
            expect(later.data).toMatchObject({pipelineRunId, status: 'cancelled'})
        })

        it('a standalone Run All stop is remembered by the server: a tab opened later sees it with its time', async () => {
            fakePlaywright({API: ['t1']})
            const runId = await startRunAll('API')
            await api().post(`/api/runs/${runId}/stop`).send({}).expect(200)

            const lateTab = await current().expect(200)

            expect(lateTab.body.lastStop).toMatchObject({
                kind: 'run-all',
                name: 'API',
                reason: 'manual',
            })
            expect(typeof lateTab.body.lastStop.stoppedAt).toBe('string')
            expect(lateTab.body.lastStop.steps).toBeUndefined()
        })

        it('the flow from the review: a pipeline is stopped, then Run All is started and stopped — the Run All stop is the one shown', async () => {
            await stopPipeline()
            fakePlaywright({API: ['t1'], WEB: ['t3']})
            const runId = await startRunAll('WEB')
            await api().post(`/api/runs/${runId}/stop`).send({}).expect(200)

            const stop = (await current().expect(200)).body.lastStop

            expect(stop).toMatchObject({kind: 'run-all', name: 'WEB'})
        })

        it('a finished single-test rerun (a registered rerun process) ends it too', async () => {
            fakePlaywright({API: ['t1']})
            const runId = await startRunAll('API')
            await api().post(`/api/runs/${runId}/stop`).send({}).expect(200)
            await nextMs()
            const child = new EventEmitter()
            runProcessRegistry.register(
                {runId: `rerun-${rand()}`, type: 'rerun', project: 'API'},
                child as any
            )
            expect((await current().expect(200)).body.lastStop).not.toBeNull()

            child.emit('close', 0)

            // Whatever pipeline state an earlier test left, the stop notice itself is over.
            expect((await current()).body.lastStop ?? null).toBeNull()
        })

        it('the next CI pipeline starting clears it', async () => {
            fakePlaywright({API: ['t1'], WEB: ['t3']})
            const runId = await startRunAll('API')
            await api().post(`/api/runs/${runId}/stop`).send({}).expect(200)
            expect((await current().expect(200)).body.lastStop).not.toBeNull()

            await api()
                .post('/api/pipeline/run')
                .send({pipeline: 'develop', source: 'script'})
                .expect(200)

            expect((await current().expect(200)).body.lastStop).toBeNull()
            // Leave the dashboard idle for the next test.
            await api().post('/api/pipeline/stop').send({}).expect(200)
        })
    })

    it('the old global POST /api/pipeline/stop still works next to it', async () => {
        fakePlaywright({API: ['t1']})
        const runId = await startRunAll('API')

        const stop = await api().post('/api/pipeline/stop').send({reason: 'manual'}).expect(200)

        expect(stop.body.data).toMatchObject({stopped: true, runIds: [runId], resultsKept: true})
    })
})

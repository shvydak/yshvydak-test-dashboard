/**
 * Pipeline status "still failing" (integration): real app + SQLite, only Playwright is faked.
 *
 * After a pipeline stops on a failed step, GET /pipeline/status/current reports how many of that
 * step's failed tests still fail NOW (latest row per test), so the web banner follows reruns and fixes.
 */

import {describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi} from 'vitest'
import request from 'supertest'
import {EventEmitter} from 'events'
import type {TestServerInstance} from '../helpers/testServer'
import {setupTestServer, teardownTestServer, cleanDatabase} from '../helpers/testServer'
import {activeProcessesTracker} from '../../../services/activeProcesses.service'
import {CINotifierService} from '../../../services/ciNotifier.service'

const flush = () => new Promise((resolve) => setImmediate(resolve))

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 3000) {
    const started = Date.now()
    while (!(await condition())) {
        if (Date.now() - started > timeoutMs) throw new Error('waitFor timed out')
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
}

describe('Pipeline status: still-failing counts (Integration)', () => {
    let server: TestServerInstance
    let children: Record<string, EventEmitter & {kill: any}>
    let spawned: string[]
    let originalEnableAuth: string | undefined
    let rerunSeq: number
    // Run ids stay unique across tests so a late write of an earlier pipeline cannot touch a later one.
    let spawnSeq = 0

    const api = () => ({
        post: (url: string) =>
            request(server.url).post(url).set('Authorization', `Bearer ${server.authToken}`),
        get: (url: string) =>
            request(server.url).get(url).set('Authorization', `Bearer ${server.authToken}`),
        put: (url: string) =>
            request(server.url).put(url).set('Authorization', `Bearer ${server.authToken}`),
        delete: (url: string) =>
            request(server.url).delete(url).set('Authorization', `Bearer ${server.authToken}`),
    })
    const db = () => server.testRepository.dbManager

    // The spawn mock is hit before TestService writes the run row; reporter calls must wait for it.
    const spawnedRun = async (n: number) => {
        await waitFor(() => spawned.length === n)
        const runId = spawned[n - 1]
        await waitFor(
            async () => !!(await db().queryOne('SELECT id FROM test_runs WHERE id = ?', [runId]))
        )
        return runId
    }

    const reporterResult = (runId: string, testId: string, project: string, status: string) =>
        api()
            .post('/api/tests')
            .send({
                id: `${runId}-${testId}`,
                runId,
                testId,
                name: testId,
                filePath: `${project}/${testId}.spec.ts`,
                status,
                duration: 5,
                project,
                timestamp: new Date().toISOString(),
            })

    // A later execution of a test (a manual rerun, a fixed push): an INSERT with a strictly later created_at.
    const rerun = async (testId: string, project: string, status: string) => {
        rerunSeq++
        const runId = `rerun-${rerunSeq}`
        const at = new Date(Date.now() + 60_000 + rerunSeq * 1000).toISOString()
        await db().execute(
            `INSERT INTO test_runs (id, status, total_tests, passed_tests, failed_tests) VALUES (?, 'completed', 1, 0, 0)`,
            [runId]
        )
        await db().execute(
            `INSERT INTO test_results (id, run_id, test_id, name, file_path, status, project, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                `${runId}-row`,
                runId,
                testId,
                testId,
                `${project}/${testId}.spec.ts`,
                status,
                project,
                at,
                at,
            ]
        )
    }

    const configureTabs = (apiStops = true) =>
        server.serviceContainer.settingsService.setProjectTabConfigs([
            {
                project: 'API',
                displayName: 'API',
                visible: true,
                pipelines: ['develop'],
                stopPipelineOnFailure: apiStops,
            },
            {
                project: 'WEB',
                displayName: 'WEB',
                visible: true,
                pipelines: ['develop'],
                stopPipelineOnFailure: false,
            },
        ])

    const fakePlaywright = () => {
        const playwright = server.serviceContainer.playwrightService as any
        vi.spyOn(playwright, 'discoverTests').mockImplementation((async () => []) as any)
        vi.spyOn(playwright, 'runAllTests').mockImplementation((async (
            _workers: unknown,
            project?: string
        ) => {
            const runId = `run-${project ?? 'all'}-${++spawnSeq}`
            const child = new EventEmitter() as EventEmitter & {kill: any}
            child.kill = vi.fn()
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

    // API step: t1/t2/t3 failed, t4 passed, t5 timed out. WEB step has one failing test of its own.
    const runPipelineToFailure = async (apiResults: Array<[string, string]>) => {
        await api()
            .post('/api/pipeline/run')
            .send({pipeline: 'develop', source: 'script', notify: true})
            .expect(200)
        const apiRun = await spawnedRun(1)
        await api()
            .post('/api/tests/process-start')
            .send({runId: apiRun, type: 'run-all', totalTests: 5})
        for (const [testId, status] of apiResults) {
            await reporterResult(apiRun, testId, 'API', status).expect(200)
        }
        const failed = apiResults.filter(([, s]) => s !== 'passed').length
        await api()
            .put(`/api/runs/${apiRun}`)
            .send({
                status: 'failed',
                totalTests: apiResults.length,
                passedTests: apiResults.length - failed,
                failedTests: failed,
            })
            .expect(200)
        children[apiRun].emit('close', 0)
        await waitFor(async () => {
            const res = await api().get('/api/pipeline/status/current')
            return res.body.data?.status === 'stopped_early'
        })
        // finish() clears the marker last; later calls must not race the pipeline's own cleanup.
        await waitFor(
            async () =>
                (await server.serviceContainer.settingsService.getInFlightPipeline()) === null
        )
        return apiRun
    }

    const apiStep = async () => {
        const res = await api().get('/api/pipeline/status/current').expect(200)
        return res.body.data.steps.find((s: {project: string}) => s.project === 'API')
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
        rerunSeq = 0
        vi.spyOn(CINotifierService.prototype, 'notifyResult').mockResolvedValue(undefined)
        await configureTabs()
        fakePlaywright()
    })

    afterEach(async () => {
        for (let i = 0; i < 5; i++) {
            Object.values(children).forEach((child) => child.emit('close', 0))
            await flush()
        }
        activeProcessesTracker.forceReset()
    })

    const FAILING_RUN: Array<[string, string]> = [
        ['t1', 'failed'],
        ['t2', 'failed'],
        ['t3', 'failed'],
        ['t4', 'passed'],
    ]

    it('reports every failed test as still failing right after the pipeline stopped', async () => {
        await runPipelineToFailure(FAILING_RUN)

        const res = await api().get('/api/pipeline/status/current').expect(200)

        expect(res.body.data.status).toBe('stopped_early')
        const step = res.body.data.steps.find((s: {project: string}) => s.project === 'API')
        expect(step).toMatchObject({status: 'failed', failed: 3, failedTotal: 3, stillFailing: 3})
        expect(res.body.data.steps.find((s: {project: string}) => s.project === 'WEB').status).toBe(
            'skipped'
        )
    })

    it('a rerun that passes lowers the count; the original total stays', async () => {
        await runPipelineToFailure(FAILING_RUN)
        await rerun('t1', 'API', 'passed')

        expect(await apiStep()).toMatchObject({failedTotal: 3, stillFailing: 2})

        await rerun('t2', 'API', 'passed')
        expect(await apiStep()).toMatchObject({failedTotal: 3, stillFailing: 1})
    })

    it('a later failing rerun raises the count again', async () => {
        await runPipelineToFailure(FAILING_RUN)
        await rerun('t1', 'API', 'passed')
        expect(await apiStep()).toMatchObject({stillFailing: 2})

        await rerun('t1', 'API', 'failed')

        expect(await apiStep()).toMatchObject({failedTotal: 3, stillFailing: 3})
    })

    it('reports 0 (not an absent field) once every failed test passes', async () => {
        await runPipelineToFailure(FAILING_RUN)
        await rerun('t1', 'API', 'passed')
        await rerun('t2', 'API', 'passed')
        await rerun('t3', 'API', 'passed')

        const step = await apiStep()

        expect(step.stillFailing).toBe(0)
        expect(step.failedTotal).toBe(3)
    })

    it('a skipped latest row counts as resolved', async () => {
        await runPipelineToFailure(FAILING_RUN)
        await rerun('t1', 'API', 'skipped')

        expect(await apiStep()).toMatchObject({failedTotal: 3, stillFailing: 2})
    })

    describe('discovery pending rows', () => {
        const discoverAs = (project: string) => {
            const playwright = server.serviceContainer.playwrightService as any
            vi.spyOn(playwright, 'discoverTests').mockImplementation((async () =>
                ['t1', 't2', 't3', 't4'].map((name) => ({
                    id: `disc-${name}-${Math.random().toString(36).slice(2)}`,
                    testId: name,
                    runId: null,
                    name,
                    filePath: `${project}/${name}.spec.ts`,
                    status: 'pending',
                    duration: 0,
                    project,
                    metadata: {},
                    timestamp: new Date(Date.now() + 120_000).toISOString(),
                }))) as any)
        }

        const discover = async () => {
            const res = await api().post('/api/tests/discovery').send({project: 'API'})
            expect(res.status, JSON.stringify(res.body)).toBe(200)
        }

        it('Discover (reset) writes pending rows but the failed tests still count as failing', async () => {
            await runPipelineToFailure(FAILING_RUN)
            discoverAs('API')

            await discover()

            const latest = await db().queryOne(
                'SELECT status, run_id FROM test_results WHERE test_id = ? ORDER BY created_at DESC LIMIT 1',
                ['t1']
            )
            expect(latest).toMatchObject({status: 'pending', run_id: null})
            expect(await apiStep()).toMatchObject({failedTotal: 3, stillFailing: 3})
        })

        it('the pending rows of a new Run All start keep them failing too', async () => {
            await runPipelineToFailure(FAILING_RUN)
            discoverAs('API')

            await api().post('/api/tests/run-all').send({project: 'API'}).expect(200)
            await spawnedRun(2)

            expect(await apiStep()).toMatchObject({failedTotal: 3, stillFailing: 3})
        })

        it('a later passed row resolves a test behind a pending row; a later failing one does not', async () => {
            await runPipelineToFailure(FAILING_RUN)
            discoverAs('API')
            await discover()

            await rerun('t1', 'API', 'passed')
            expect(await apiStep()).toMatchObject({stillFailing: 2})

            await rerun('t2', 'API', 'failed')
            expect(await apiStep()).toMatchObject({stillFailing: 2})
        })

        it('a pending row in another project (the test moved there) counts as resolved', async () => {
            await runPipelineToFailure(FAILING_RUN)
            await rerun('t1', 'To_Fix', 'pending')

            expect(await apiStep()).toMatchObject({failedTotal: 3, stillFailing: 2})
        })

        it('behind a same-project pending row, a newer non-pending row in another project still means moved', async () => {
            await runPipelineToFailure(FAILING_RUN)
            await rerun('t1', 'To_Fix', 'failed')
            await rerun('t1', 'API', 'pending')

            expect(await apiStep()).toMatchObject({failedTotal: 3, stillFailing: 2})
        })

        it('a test with only pending rows left (its results gone) is resolved', async () => {
            await runPipelineToFailure(FAILING_RUN)
            // The failed row itself is gone, as after a delete; only discovery rows remain.
            await db().execute('DELETE FROM test_results WHERE test_id = ?', ['t2'])
            await rerun('t2', 'API', 'pending')

            expect(await apiStep()).toMatchObject({failedTotal: 3, stillFailing: 2})
        })
    })

    it('a test that fails under another project (moved to To_Fix) counts as resolved here', async () => {
        await runPipelineToFailure(FAILING_RUN)
        await rerun('t1', 'To_Fix', 'failed')

        expect(await apiStep()).toMatchObject({failedTotal: 3, stillFailing: 2})
    })

    it('failedTotal never drops below the failed rows of the run (timedOut is not in step.failed)', async () => {
        // The reporter counts only `failed`: 1 failed + 2 timedOut rows, failed_tests = 1.
        await api()
            .post('/api/pipeline/run')
            .send({pipeline: 'develop', source: 'script', notify: true})
            .expect(200)
        const apiRun = await spawnedRun(1)
        await api()
            .post('/api/tests/process-start')
            .send({runId: apiRun, type: 'run-all', totalTests: 3})
        for (const [testId, status] of [
            ['t1', 'failed'],
            ['t2', 'timedOut'],
            ['t3', 'timedOut'],
        ]) {
            await reporterResult(apiRun, testId, 'API', status).expect(200)
        }
        await api()
            .put(`/api/runs/${apiRun}`)
            .send({status: 'failed', totalTests: 3, passedTests: 0, failedTests: 1})
            .expect(200)
        children[apiRun].emit('close', 0)
        await waitFor(async () => {
            const res = await api().get('/api/pipeline/status/current')
            return res.body.data?.status === 'stopped_early'
        })

        const step = await apiStep()

        expect(step).toMatchObject({failed: 1, failedTotal: 3, stillFailing: 3})
    })

    it('a crash step (run row still running, failed 0) gets no counts', async () => {
        await api()
            .post('/api/pipeline/run')
            .send({pipeline: 'develop', source: 'script', notify: true})
            .expect(200)
        const apiRun = await spawnedRun(1)
        // Rows exist and fail, but the reporter's onEnd never landed.
        await reporterResult(apiRun, 't1', 'API', 'failed').expect(200)
        children[apiRun].emit('close', 0)
        await waitFor(async () => {
            const res = await api().get('/api/pipeline/status/current')
            return res.body.data?.status === 'stopped_early'
        })

        const step = await apiStep()

        expect(step).toMatchObject({status: 'failed', failed: 0})
        expect(step).not.toHaveProperty('stillFailing')
        expect(step).not.toHaveProperty('failedTotal')
    })

    it('timedOut counts as failing, in the step run and as the latest row', async () => {
        await runPipelineToFailure([
            ['t1', 'timedOut'],
            ['t2', 'failed'],
            ['t4', 'passed'],
        ])

        expect(await apiStep()).toMatchObject({failedTotal: 2, stillFailing: 2})

        await rerun('t2', 'API', 'timedOut')
        expect(await apiStep()).toMatchObject({stillFailing: 2})

        await rerun('t1', 'API', 'passed')
        expect(await apiStep()).toMatchObject({failedTotal: 2, stillFailing: 1})
    })

    it('a deleted test counts as resolved', async () => {
        await runPipelineToFailure(FAILING_RUN)

        await api().delete('/api/tests/t2').expect(200)

        expect(await apiStep()).toMatchObject({failedTotal: 3, stillFailing: 2})
    })

    it("another project's rows do not interfere", async () => {
        await runPipelineToFailure(FAILING_RUN)
        // Unrelated tests failing or passing elsewhere.
        await rerun('web-t9', 'WEB', 'failed')
        await rerun('t4', 'API', 'failed')
        expect(await apiStep()).toMatchObject({failedTotal: 3, stillFailing: 3})

        // The same test id reported by another project is attributed to that project (like the tab badges).
        await rerun('t1', 'WEB', 'passed')
        expect(await apiStep()).toMatchObject({failedTotal: 3, stillFailing: 2})
    })

    it('a pipeline that did not stop early carries no live fields', async () => {
        await configureTabs(false)
        await api()
            .post('/api/pipeline/run')
            .send({pipeline: 'develop', source: 'script', notify: true})
            .expect(200)
        const apiRun = await spawnedRun(1)
        await reporterResult(apiRun, 't1', 'API', 'failed').expect(200)
        await api()
            .put(`/api/runs/${apiRun}`)
            .send({status: 'failed', totalTests: 1, passedTests: 0, failedTests: 1})
            .expect(200)
        children[apiRun].emit('close', 0)
        const webRun = await spawnedRun(2)
        await api()
            .put(`/api/runs/${webRun}`)
            .send({status: 'completed', totalTests: 0, passedTests: 0, failedTests: 0})
            .expect(200)
        children[webRun].emit('close', 0)
        await waitFor(async () => {
            const res = await api().get('/api/pipeline/status/current')
            return res.body.data?.status === 'completed'
        })

        const step = await apiStep()

        expect(step.status).toBe('failed')
        expect(step).not.toHaveProperty('stillFailing')
        expect(step).not.toHaveProperty('failedTotal')
    })

    it('still answers (without counts) when the count query fails', async () => {
        await runPipelineToFailure(FAILING_RUN)
        vi.spyOn(server.testRepository, 'getStillFailingByRun').mockRejectedValue(
            new Error('db down')
        )

        const step = await apiStep()

        expect(step).toMatchObject({status: 'failed', failed: 3})
        expect(step).not.toHaveProperty('stillFailing')
    })
})

/**
 * Stop (integration): real app, real SQLite, real attachment storage; only Playwright is faked.
 *
 * Manual Stop and the watchdog timeout KEEP what was saved: the runs still running at the signal end as
 * failed + metadata.stopped, finished pipeline steps are left alone, and a result cut by the stop is never saved.
 * Only a newer CI deploy replacing a running one (reason replaced) discards: everything the run wrote is deleted.
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
import {runProcessRegistry} from '../../../services/runProcessRegistry.service'
import {CINotifierService} from '../../../services/ciNotifier.service'
import {config} from '../../../config/environment.config'

const OLD = '2026-01-01T08:00:00.000Z'
const rand = () => Math.random().toString(36).slice(2, 8)

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
    let notifyTimeLimitStop: MockInstance<any>
    let notifyTimeout: MockInstance<any>
    let broadcasts: MockInstance<any>

    const api = () => ({
        post: (url: string) =>
            request(server.url).post(url).set('Authorization', `Bearer ${server.authToken}`),
        get: (url: string) =>
            request(server.url).get(url).set('Authorization', `Bearer ${server.authToken}`),
        put: (url: string) =>
            request(server.url).put(url).set('Authorization', `Bearer ${server.authToken}`),
    })
    const db = () => server.testRepository.dbManager

    // The spawn mock runs before TestService writes the run row; reporter calls must wait for it.
    const spawnedRun = async (n: number) => {
        await waitFor(() => spawned.length === n)
        const runId = spawned[n - 1]
        await waitFor(
            async () => !!(await db().queryOne('SELECT id FROM test_runs WHERE id = ?', [runId]))
        )
        return runId
    }

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
            attachments?: unknown[],
            extra: Record<string, unknown> = {}
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
                    ...extra,
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
            ['prev-t5', 'test-t5', 'passed', 'WEB'],
            ['prev-t9', 'test-t9', 'passed', 'WEB'],
        ]
        for (const [id, testId, status, project] of rows) {
            await db().execute(
                `INSERT INTO test_results (id, run_id, test_id, name, file_path, status, project, created_at, updated_at)
                 VALUES (?, 'prev-run', ?, ?, ?, ?, ?, ?, ?)`,
                [id, testId, testId, `${project}/${testId}.spec.ts`, status, project, OLD, OLD]
            )
        }
    }

    const tab = (project: string, pipelines: Array<'develop' | 'production'>) => ({
        project,
        displayName: project,
        visible: true,
        pipelines,
        stopPipelineOnFailure: false,
    })

    const configureTabs = (
        tabs = [tab('API', ['develop']), tab('WEB', ['develop']), tab('SMOKE', ['production'])]
    ) => server.serviceContainer.settingsService.setProjectTabConfigs(tabs)

    // The child gets SIGINT but lingers until released: reporter posts can land inside the stop window.
    const holdClose = (runId: string) => {
        const child = children[runId]
        child.kill = vi.fn()
        return () => child.emit('close', null, 'SIGINT')
    }

    const startStop = (body: Record<string, unknown> = {}) =>
        api()
            .post('/api/pipeline/stop')
            .send(body)
            .then((res) => res)

    const runRow = async (runId: string) =>
        (await db().queryOne('SELECT * FROM test_runs WHERE id = ?', [runId])) as any

    // Playwright fake: discovery returns fixed tests; a run is a child that dies on SIGINT.
    const fakePlaywright = (discoveryByProject: Record<string, string[]>) => {
        const playwright = server.serviceContainer.playwrightService as any
        vi.spyOn(playwright, 'discoverTests').mockImplementation((async (project?: string) =>
            project ? discovered(project, discoveryByProject[project] ?? []) : []) as any)
        vi.spyOn(playwright, 'runAllTests').mockImplementation((async (
            _workers: unknown,
            project?: string
        ) => {
            // Random: the run registry is process-wide and remembers stopped run ids.
            const runId = `run-${project ?? 'all'}-${spawned.length + 1}-${Math.random().toString(36).slice(2, 8)}`
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
        notifyTimeLimitStop = vi.spyOn(CINotifierService.prototype, 'notifyTimeLimitStop')
        notifyTimeLimitStop.mockResolvedValue(undefined)
        notifyTimeout = vi.spyOn(CINotifierService.prototype, 'notifyTimeout')
        notifyTimeout.mockResolvedValue(undefined)
        broadcasts = vi.spyOn(server.serviceContainer.websocketService, 'broadcast')
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

    describe('a CI pipeline (manual stop keeps the results)', () => {
        it('stop mid step 2 of 3: step 1 untouched, step 2 finalized from the DB, cut results dropped, pending rows undone, one Slack message', async () => {
            await configureTabs([
                tab('API', ['develop']),
                tab('WEB', ['develop']),
                tab('MOB', ['develop']),
            ])
            fakePlaywright({
                API: ['t1', 't2', 't4'],
                WEB: ['t3', 't5', 't6', 't8', 't9', 't10', 't11', 't12'],
                MOB: ['t7'],
            })
            // Only files under Playwright's output dir are copied into storage.
            const outputDir = path.join(server.dbPath, 'test-results')
            fs.mkdirSync(outputDir, {recursive: true})
            const trace = path.join(outputDir, 'trace.zip')
            fs.writeFileSync(trace, 'zip-bytes')

            const started = await api()
                .post('/api/pipeline/run')
                .send({pipeline: 'develop', source: 'script', notify: true})
                .expect(200)
            const pipelineRunId = started.body.data.pipelineRunId
            const apiRun = await spawnedRun(1)

            // Step 1 (API) reports and finishes.
            await reporter.processStart(apiRun).expect(200)
            await reporter
                .result(apiRun, 'new-t1', 'test-t1', 'API', 'failed', [
                    {name: 'trace', path: trace, contentType: 'application/zip'},
                ])
                .expect(200)
            await reporter.result(apiRun, 'new-t2', 'test-t2', 'API', 'passed').expect(200)
            await reporter.result(apiRun, 'new-t4', 'test-t4', 'API', 'passed').expect(200)
            await reporter.runDone(apiRun, 2, 1).expect(200)
            children[apiRun].emit('close', 0)

            // Step 2 (WEB) starts; one real failure lands before the stop.
            const webRun = await spawnedRun(2)
            await reporter.processStart(webRun).expect(200)
            await reporter.result(webRun, 'new-t3', 'test-t3', 'WEB', 'failed').expect(200)

            const step1Before = JSON.stringify(await runRow(apiRun))
            const attachment = await db().queryOne(
                'SELECT file_path FROM attachments WHERE test_result_id = ?',
                ['new-t1']
            )
            const settings = server.serviceContainer.settingsService
            expect(await settings.getInFlightPipeline()).not.toBeNull()
            const markersAtSlack: unknown[] = []
            notifyStopped.mockImplementation(async () => {
                markersAtSlack.push(
                    await settings.getInFlightPipeline(),
                    await settings.getInFlightRun()
                )
            })
            const cancelled = vi.spyOn(
                server.serviceContainer.websocketService,
                'broadcastRunCancelled'
            )

            const release = holdClose(webRun)
            const stop = startStop({reason: 'manual'})
            await waitFor(() => children[webRun].kill.mock.calls.length > 0)
            const signalledAt = runProcessRegistry.getStopSignalledAt(webRun)!
            expect(typeof signalledAt).toBe('number')
            const at = (ms: number) => new Date(ms).toISOString()

            // The reporter's SIGINT teardown posts inside the stop window.
            const window = {
                interruptedWithError: reporter.result(
                    webRun,
                    'x-t5',
                    'test-t5',
                    'WEB',
                    'failed',
                    undefined,
                    {
                        errorMessage: 'page.click: Test ended.',
                        timestamp: at(signalledAt + 40),
                    }
                ),
                boundary: reporter.result(webRun, 'x-t6', 'test-t6', 'WEB', 'failed', undefined, {
                    timestamp: at(signalledAt),
                }),
                realFailureBeforeSignal: reporter.result(
                    webRun,
                    'x-t12',
                    'test-t12',
                    'WEB',
                    'failed',
                    undefined,
                    {
                        timestamp: at(signalledAt - 1),
                    }
                ),
                noTimestamp: reporter.result(
                    webRun,
                    'x-t8',
                    'test-t8',
                    'WEB',
                    'failed',
                    undefined,
                    {
                        timestamp: undefined,
                    }
                ),
                rawInterrupted: reporter.result(
                    webRun,
                    'x-t9',
                    'test-t9',
                    'WEB',
                    'failed',
                    undefined,
                    {
                        timestamp: at(signalledAt - 5000),
                        metadata: {rawStatus: 'interrupted'},
                    }
                ),
                passedAfterSignal: reporter.result(
                    webRun,
                    'x-t10',
                    'test-t10',
                    'WEB',
                    'passed',
                    undefined,
                    {
                        timestamp: at(signalledAt + 40),
                    }
                ),
                timedOutAfterSignal: reporter.result(
                    webRun,
                    'x-t11',
                    'test-t11',
                    'WEB',
                    'timedOut',
                    undefined,
                    {
                        timestamp: at(signalledAt + 40),
                    }
                ),
            }
            const answers = await Promise.all(Object.values(window))
            const byName = Object.fromEntries(
                Object.keys(window).map((name, i) => [name, answers[i].body.message as string])
            )
            // The reporter's onEnd: its own (wrong) counts must not survive the finalize.
            await reporter.runDone(webRun, 9, 9).expect(200)
            release()
            const stopResponse = await stop

            expect(stopResponse.status).toBe(200)
            expect(stopResponse.body.data).toMatchObject({
                stopped: true,
                reason: 'manual',
                pipelineRunId,
                resultsKept: true,
            })
            expect(stopResponse.body.data.runIds.sort()).toEqual([apiRun, webRun].sort())

            // Dropped = acknowledged, never stored; kept = stored.
            expect(byName.interruptedWithError).toMatch(/interrupted by stop/i)
            expect(byName.boundary).toMatch(/interrupted by stop/i)
            expect(byName.rawInterrupted).toMatch(/interrupted by stop/i)
            expect(byName.realFailureBeforeSignal).not.toMatch(/ignored/i)
            expect(byName.noTimestamp).not.toMatch(/ignored/i)
            expect(byName.passedAfterSignal).not.toMatch(/ignored/i)
            expect(byName.timedOutAfterSignal).not.toMatch(/ignored/i)

            // Step 1: the run row is byte-identical, its results and attachment stay.
            expect(JSON.stringify(await runRow(apiRun))).toBe(step1Before)
            expect(
                await db().queryAll('SELECT id FROM test_results WHERE run_id = ?', [apiRun])
            ).toHaveLength(3)
            expect(fs.existsSync(attachment.file_path)).toBe(true)

            // Step 2: kept rows only.
            const webRows = await db().queryAll(
                'SELECT id, status FROM test_results WHERE run_id = ? ORDER BY id',
                [webRun]
            )
            expect(webRows.map((r: any) => r.id)).toEqual([
                'new-t3',
                'x-t10',
                'x-t11',
                'x-t12',
                'x-t8',
            ])
            const webRowAfter = await runRow(webRun)
            expect(webRowAfter).toMatchObject({
                status: 'failed',
                total_tests: 5,
                passed_tests: 1,
                failed_tests: 4,
                skipped_tests: 0,
            })
            const metadata = JSON.parse(webRowAfter.metadata)
            expect(metadata).toMatchObject({
                type: 'run-all',
                triggeredFrom: 'dashboard',
                project: 'WEB',
                stopped: {reason: 'manual'},
            })
            expect(new Date(metadata.stopped.at).toISOString()).toBe(metadata.stopped.at)

            // Cut tests show their previous result; a never-run test without history stays pending.
            expect(await latestStatus('test-t5')).toMatchObject({
                status: 'passed',
                run_id: 'prev-run',
            })
            expect(await latestStatus('test-t9')).toMatchObject({
                status: 'passed',
                run_id: 'prev-run',
            })
            expect(await latestStatus('test-t6')).toMatchObject({status: 'pending', run_id: null})
            expect(await latestStatus('test-t3')).toMatchObject({status: 'failed', run_id: webRun})
            expect(await latestStatus('test-t1')).toMatchObject({status: 'failed', run_id: apiRun})

            // The pipeline: cancelled, results kept, the step cut by the stop is `stopped`.
            const status = await api().get('/api/pipeline/status/current').expect(200)
            expect(status.body.stopping).toBe(false)
            expect(status.body.data).toMatchObject({
                status: 'cancelled',
                stopReason: 'manual',
                resultsKept: true,
            })
            expect(status.body.data.steps.map((s: any) => s.status)).toEqual([
                'failed',
                'stopped',
                'skipped',
            ])
            expect(status.body.data.steps[0]).toMatchObject({runId: apiRun, passed: 2, failed: 1})
            expect(status.body.data.steps[1]).toMatchObject({runId: webRun, passed: 1, failed: 4})

            // One Slack message, with the kept counts only; both markers were already cleared when it went out.
            expect(notifyStopped).toHaveBeenCalledTimes(1)
            const slackSteps = notifyStopped.mock.calls[0][1] as any[]
            expect(slackSteps.map((s: any) => [s.project, s.status, s.failed ?? 0])).toEqual([
                ['API', 'failed', 1],
                ['WEB', 'stopped', 4],
                ['MOB', 'skipped', 0],
            ])
            expect(notifyResult).not.toHaveBeenCalled()
            expect(markersAtSlack).toEqual([null, null])
            expect(cancelled).toHaveBeenCalledTimes(1)
            expect(cancelled.mock.calls[0][1]).toBe('manual')
            expect(cancelled.mock.calls[0][3]).toBe(true)
            expect([...cancelled.mock.calls[0][0]].sort()).toEqual([apiRun, webRun].sort())

            expect(activeProcessesTracker.isProcessRunning(apiRun)).toBe(false)
            expect(activeProcessesTracker.isProcessRunning(webRun)).toBe(false)
            expect(await settings.getInFlightPipeline()).toBeNull()
            expect(await settings.getInFlightRun()).toBeNull()
        })

        it('late reporter posts for the stopped run are acknowledged but ignored', async () => {
            fakePlaywright({API: ['t1'], WEB: ['t3']})
            await api()
                .post('/api/pipeline/run')
                .send({pipeline: 'develop', source: 'script'})
                .expect(200)
            const apiRun = await spawnedRun(1)
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

        it('stop between steps: step 2 never spawns, step 1 keeps its results and its run row', async () => {
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
            const apiRun = await spawnedRun(1)
            await reporter.result(apiRun, 'new-t1', 'test-t1', 'API', 'failed').expect(200)
            await reporter.runDone(apiRun, 0, 1).expect(200)
            children[apiRun].emit('close', 0)
            await waitFor(() => typeof webDiscovery.finish === 'function')
            const step1Before = JSON.stringify(await runRow(apiRun))

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
            ).toHaveLength(1)
            expect(JSON.stringify(await runRow(apiRun))).toBe(step1Before)
            expect(await latestStatus('test-t1')).toMatchObject({status: 'failed', run_id: apiRun})
            // Step 2's discovery rows are undone: t3 shows its previous result.
            expect(await latestStatus('test-t3')).toMatchObject({
                status: 'passed',
                run_id: 'prev-run',
            })
            const status = await api().get('/api/pipeline/status/current').expect(200)
            expect(status.body.data.steps.map((s: any) => s.status)).toEqual(['failed', 'skipped'])
        })
    })

    describe('the watchdog time limit (keeps the results)', () => {
        afterEach(() => {
            delete process.env.CI_PIPELINE_TIMEOUT_MINUTES
        })

        it('stops the pipeline with reason timeout, keeps what was saved, and posts exactly one Slack message after the stop', async () => {
            process.env.CI_PIPELINE_TIMEOUT_MINUTES = '0.02'
            fakePlaywright({API: ['t1', 't2'], WEB: ['t3']})
            await api()
                .post('/api/pipeline/run')
                .send({pipeline: 'develop', source: 'script', notify: true})
                .expect(200)
            const apiRun = await spawnedRun(1)
            await reporter.processStart(apiRun).expect(200)
            await reporter.result(apiRun, 'new-t1', 'test-t1', 'API', 'passed').expect(200)

            const pipelines = server.serviceContainer.pipelineExecutionService
            await waitFor(() => pipelines.getCurrentPipeline()?.status === 'cancelled', 10_000)
            await waitFor(() => notifyTimeLimitStop.mock.calls.length > 0)
            await new Promise((resolve) => setTimeout(resolve, 300))

            expect(children[apiRun].kill).toHaveBeenCalledWith('SIGINT')
            expect(pipelines.getCurrentPipeline()).toMatchObject({
                stopReason: 'timeout',
                resultsKept: true,
            })
            expect(await latestStatus('test-t1')).toMatchObject({status: 'passed', run_id: apiRun})
            const row = await runRow(apiRun)
            expect(row.status).toBe('failed')
            expect(JSON.parse(row.metadata).stopped.reason).toBe('timeout')
            expect(notifyTimeLimitStop).toHaveBeenCalledTimes(1)
            expect(notifyTimeout).not.toHaveBeenCalled()
            expect(notifyStopped).not.toHaveBeenCalled()
            expect(notifyResult).not.toHaveBeenCalled()
            expect(spawned).toEqual([apiRun])
        })
    })

    describe('a manual run', () => {
        it('Run All started from the UI: stop keeps the results, marks the run failed + stopped, undoes the discovery takeover', async () => {
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

            expect(stop.body.data).toMatchObject({
                stopped: true,
                runIds: [runId],
                resultsKept: true,
            })
            const row = await runRow(runId)
            expect(row).toMatchObject({status: 'failed', total_tests: 1, passed_tests: 1})
            expect(JSON.parse(row.metadata).stopped.reason).toBe('manual')
            // The finished test keeps its result; the one that never ran shows its previous result again.
            expect(await latestStatus('test-t1')).toMatchObject({status: 'passed', run_id: runId})
            expect(await latestStatus('test-t2')).toMatchObject({
                status: 'failed',
                run_id: 'prev-run',
            })
            expect(activeProcessesTracker.isProcessRunning(runId)).toBe(false)
            expect(await server.serviceContainer.settingsService.getInFlightRun()).toBeNull()
            // No run:completed for a stopped run; a manual run posts nothing to Slack.
            expect(
                broadcasts.mock.calls.filter((c: any[]) => c[0]?.type === 'run:completed')
            ).toEqual([])
            expect(notifyStopped).not.toHaveBeenCalled()
        })

        it('Run All with auto-discover off: Stop leaves the old placeholder rows it never wrote; the run results stay', async () => {
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

            expect(
                await db().queryAll(`SELECT id FROM test_results WHERE id = 'old-pending-t1'`)
            ).toHaveLength(1)
            expect(await latestStatus('test-t1')).toMatchObject({
                status: 'passed',
                run_id: run.body.data.runId,
            })
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

        it('late posts after the stop has finished are ignored: result, test-start, process-start and the run PUT', async () => {
            fakePlaywright({API: ['t1', 't2']})
            const run = await api()
                .post('/api/tests/run-all')
                .send({project: 'API', skipAutoDiscovery: true})
                .expect(200)
            const runId = run.body.data.runId
            await reporter.result(runId, 'new-t1', 'test-t1', 'API', 'passed').expect(200)
            await api().post('/api/pipeline/stop').send({}).expect(200)
            const before = JSON.stringify(await runRow(runId))

            const late = await reporter.result(runId, 'late-t2', 'test-t2', 'API', 'passed')
            const testStart = await reporter.testStart(runId, 'test-t2')
            const processStart = await reporter.processStart(runId)
            const put = await reporter.runDone(runId, 7, 7)

            for (const answer of [late, testStart, processStart, put]) {
                expect(answer.status).toBe(200)
                expect(answer.body.message).toMatch(/ignored/i)
            }
            expect(await db().queryAll(`SELECT id FROM test_results WHERE id = 'late-t2'`)).toEqual(
                []
            )
            expect(JSON.stringify(await runRow(runId))).toBe(before)
            expect(activeProcessesTracker.isProcessRunning(runId)).toBe(false)
        })

        it('stopping a group run keeps its results', async () => {
            const groupRunId = `group-run-${rand()}`
            const playwright = server.serviceContainer.playwrightService as any
            const child = new EventEmitter() as EventEmitter & {kill: any}
            child.kill = vi.fn(() => {
                setImmediate(() => child.emit('close', null, 'SIGINT'))
                return true
            })
            children[groupRunId] = child
            vi.spyOn(playwright, 'runTestGroup').mockResolvedValue({
                runId: groupRunId,
                message: 'started',
                timestamp: new Date().toISOString(),
                process: child,
            })
            await db().execute(
                `INSERT INTO test_catalog (project, test_id, name, file_path, discovered_at) VALUES ('API', 'test-t1', 't1', 'API/t1.spec.ts', ?)`,
                [new Date().toISOString()]
            )
            await api().post('/api/tests/run-group').send({filePath: 'API/t1.spec.ts'}).expect(200)
            await reporter.result(groupRunId, 'grp-t1', 'test-t1', 'API', 'failed').expect(200)

            await api().post('/api/pipeline/stop').send({}).expect(200)

            expect(
                await db().queryAll('SELECT id FROM test_results WHERE run_id = ?', [groupRunId])
            ).toHaveLength(1)
            expect(await latestStatus('test-t1')).toMatchObject({
                status: 'failed',
                run_id: groupRunId,
            })
            const row = await runRow(groupRunId)
            expect(row).toMatchObject({status: 'failed', total_tests: 1, failed_tests: 1})
            expect(JSON.parse(row.metadata)).toMatchObject({
                type: 'run-group',
                filePath: 'API/t1.spec.ts',
                stopped: {reason: 'manual'},
            })
        })

        it('stopping a rerun keeps its result; its close handler does not overwrite the finalized status or announce a completion', async () => {
            const rerunRunId = `rerun-run-${rand()}`
            const playwright = server.serviceContainer.playwrightService as any
            const child = new EventEmitter() as EventEmitter & {kill: any}
            // Exits with code 0 on SIGINT: without the stopping flag the rerun close handler would write `completed`.
            child.kill = vi.fn(() => {
                setImmediate(() => child.emit('close', 0, null))
                return true
            })
            children[rerunRunId] = child
            vi.spyOn(playwright, 'rerunSingleTest').mockResolvedValue({
                runId: rerunRunId,
                message: 'started',
                timestamp: new Date().toISOString(),
                process: child,
            })
            await api().post('/api/tests/prev-t1/rerun').send({}).expect(200)
            await waitFor(
                async () =>
                    !!(await db().queryOne('SELECT id FROM test_runs WHERE id = ?', [rerunRunId]))
            )
            await reporter.result(rerunRunId, 'rr-t1', 'test-t1', 'API', 'failed').expect(200)

            await api().post('/api/pipeline/stop').send({}).expect(200)
            await flush()

            const row = await runRow(rerunRunId)
            expect(row.status).toBe('failed')
            expect(JSON.parse(row.metadata).stopped.reason).toBe('manual')
            expect(await latestStatus('test-t1')).toMatchObject({
                status: 'failed',
                run_id: rerunRunId,
            })
            expect(
                broadcasts.mock.calls.filter((c: any[]) => c[0]?.type === 'run:completed')
            ).toEqual([])
        })

        it('a child that ignores SIGINT is SIGKILLed and its run is still finalized from the DB', async () => {
            const realTerminate = runProcessRegistry.terminate.bind(runProcessRegistry)
            vi.spyOn(runProcessRegistry, 'terminate').mockImplementation((id: string) =>
                realTerminate(id, 50, 50)
            )
            fakePlaywright({API: ['t1', 't2']})
            const run = await api()
                .post('/api/tests/run-all')
                .send({project: 'API', skipAutoDiscovery: true})
                .expect(200)
            const runId = run.body.data.runId
            // No reporter PUT will ever come: the run row stays `running` until the stop finalizes it.
            children[runId].kill = vi.fn((signal: string) => {
                if (signal === 'SIGKILL')
                    setImmediate(() => children[runId].emit('close', null, signal))
                return true
            })
            await reporter.result(runId, 'new-t1', 'test-t1', 'API', 'passed').expect(200)
            await reporter.result(runId, 'new-t2', 'test-t2', 'API', 'failed').expect(200)
            expect((await runRow(runId)).status).toBe('running')

            await api().post('/api/pipeline/stop').send({}).expect(200)

            expect(children[runId].kill).toHaveBeenCalledWith('SIGINT')
            expect(children[runId].kill).toHaveBeenCalledWith('SIGKILL')
            expect(await runRow(runId)).toMatchObject({
                status: 'failed',
                total_tests: 2,
                passed_tests: 1,
                failed_tests: 1,
            })
        })
    })

    describe('the CI queue after a manual stop', () => {
        it('a queued CI request starts right after the stop; the stopped run keeps its results', async () => {
            fakePlaywright({API: ['t1'], WEB: ['t3'], SMOKE: ['t20']})
            await api()
                .post('/api/pipeline/run')
                .send({pipeline: 'develop', source: 'script', notify: true})
                .expect(200)
            const apiRun = await spawnedRun(1)
            await reporter.result(apiRun, 'new-t1', 'test-t1', 'API', 'passed').expect(200)

            // Another pipeline's request waits in the queue (it does not replace the running develop run).
            const queued = await api()
                .post('/api/pipeline/run')
                .send({pipeline: 'production', source: 'script', notify: true})
                .expect(202)
            expect(queued.body.data).toEqual({status: 'queued', pipeline: 'production'})

            await api().post('/api/pipeline/stop').send({}).expect(200)

            await waitFor(() => spawned.length === 2)
            expect(spawned[1]).toContain('SMOKE')
            expect(await latestStatus('test-t1')).toMatchObject({status: 'passed', run_id: apiRun})
            const current = await api().get('/api/pipeline/status/current').expect(200)
            expect(current.body.data).toMatchObject({pipeline: 'production', status: 'running'})
            expect(current.body.queue).toEqual([])
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
            await request(server.url).post('/api/pipeline/stop').send({}).expect(401)
            await request(server.url)
                .post('/api/pipeline/stop')
                .set('Authorization', 'Bearer not-a-token')
                .send({})
                .expect(401)
            await request(server.url)
                .post('/api/pipeline/stop')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({})
                .expect(200)
        })

        it('is refused (403) when authentication is disabled, like /api/settings/*', async () => {
            process.env.ENABLE_AUTH = 'false'
            expect(config.auth.enableAuth).toBe(false)

            await request(server.url).post('/api/pipeline/stop').send({}).expect(403)
        })

        it('does not stop anything when the request is rejected', async () => {
            fakePlaywright({API: ['t1']})
            await api()
                .post('/api/tests/run-all')
                .send({project: 'API', skipAutoDiscovery: true})
                .expect(200)

            await request(server.url).post('/api/pipeline/stop').send({}).expect(401)

            expect(Object.values(children)[0].kill).not.toHaveBeenCalled()
        })

        it('only accepts reason manual over HTTP', async () => {
            await api().post('/api/pipeline/stop').send({reason: 'replaced'}).expect(400)
        })
    })

    describe('POST /api/pipeline/run (replace + JWT)', () => {
        let notifyReplaced: MockInstance<any>

        beforeEach(() => {
            notifyReplaced = vi.spyOn(CINotifierService.prototype, 'notifyReplaced')
            notifyReplaced.mockResolvedValue(undefined)
        })

        afterEach(async () => {
            process.env.ENABLE_AUTH = 'true'
            // A queued request starts when the run ends: close children until the dashboard is idle again.
            const pipelines = server.serviceContainer.pipelineExecutionService
            // A drain that already took its slot may still be starting (not yet "busy"): drop slots first.
            const queue = (pipelines as any).ciRunQueue
            while (queue.takeNext()) {}
            const settled = () =>
                !queue.isBusy() &&
                pipelines.getCurrentPipeline()?.status !== 'running' &&
                !pipelines.isStopping()
            for (let i = 0; i < 20 && !settled(); i++) {
                Object.values(children).forEach((child) => child.emit('close', 0))
                await new Promise((resolve) => setTimeout(resolve, 20))
            }
        })

        it('a newer script+notify request stops the running CI run, deletes its results, and starts on the drain', async () => {
            fakePlaywright({API: ['t1'], WEB: ['t3']})
            await api()
                .post('/api/pipeline/run')
                .send({pipeline: 'develop', source: 'script', notify: true})
                .expect(200)
            const oldRun = await spawnedRun(1)
            await reporter.processStart(oldRun).expect(200)
            await reporter.testStart(oldRun, 'test-t1').expect(200)
            await reporter.result(oldRun, 'new-t1', 'test-t1', 'API', 'failed').expect(200)

            const second = await api()
                .post('/api/pipeline/run')
                .send({pipeline: 'develop', source: 'script', notify: true})
                .expect(202)

            expect(second.body.data).toEqual({status: 'queued', pipeline: 'develop'})
            // The new pipeline starts once the old one is cleaned up.
            await waitFor(() => spawned.length === 2)
            expect(children[oldRun].kill).toHaveBeenCalledWith('SIGINT')
            expect(
                await db().queryAll('SELECT id FROM test_results WHERE run_id = ?', [oldRun])
            ).toEqual([])
            expect(await db().queryAll('SELECT id FROM test_runs WHERE id = ?', [oldRun])).toEqual(
                []
            )
            expect(notifyReplaced).toHaveBeenCalledTimes(1)
            expect(notifyStopped).not.toHaveBeenCalled()
            expect(notifyResult).not.toHaveBeenCalled()

            const current = await api().get('/api/pipeline/status/current').expect(200)
            expect(current.body.data).toMatchObject({status: 'running', pipeline: 'develop'})
            expect(current.body.queue).toEqual([])
        })

        it('replace discards everything: finished steps too, their attachments and the discovery takeover; previous results show again', async () => {
            fakePlaywright({API: ['t1', 't2', 't4'], WEB: ['t3']})
            // Only files under Playwright's output dir are copied into storage.
            const outputDir = path.join(server.dbPath, 'test-results')
            fs.mkdirSync(outputDir, {recursive: true})
            const trace = path.join(outputDir, 'trace.zip')
            fs.writeFileSync(trace, 'zip-bytes')

            const started = await api()
                .post('/api/pipeline/run')
                .send({pipeline: 'develop', source: 'script', notify: true})
                .expect(200)
            const oldPipelineRunId = started.body.data.pipelineRunId
            const apiRun = await spawnedRun(1)
            await reporter.processStart(apiRun).expect(200)
            await reporter
                .result(apiRun, 'new-t1', 'test-t1', 'API', 'failed', [
                    {name: 'trace', path: trace, contentType: 'application/zip'},
                ])
                .expect(200)
            await reporter.result(apiRun, 'new-t2', 'test-t2', 'API', 'passed').expect(200)
            await reporter.runDone(apiRun, 1, 1).expect(200)
            children[apiRun].emit('close', 0)
            const webRun = await spawnedRun(2)
            await reporter.result(webRun, 'new-t3', 'test-t3', 'WEB', 'failed').expect(200)
            const attachment = await db().queryOne(
                'SELECT file_path FROM attachments WHERE test_result_id = ?',
                ['new-t1']
            )
            expect(fs.existsSync(attachment.file_path)).toBe(true)
            const cancelled = vi.spyOn(
                server.serviceContainer.websocketService,
                'broadcastRunCancelled'
            )

            await api()
                .post('/api/pipeline/run')
                .send({pipeline: 'develop', source: 'script', notify: true})
                .expect(202)
            // The replacement starts once the old run is cleaned up.
            await waitFor(() => spawned.length === 3)

            expect(
                await db().queryAll('SELECT id FROM test_results WHERE run_id IN (?, ?)', [
                    apiRun,
                    webRun,
                ])
            ).toEqual([])
            expect(
                await db().queryAll('SELECT id FROM test_runs WHERE id IN (?, ?)', [apiRun, webRun])
            ).toEqual([])
            expect(await db().queryAll('SELECT id FROM attachments')).toEqual([])
            expect(fs.existsSync(attachment.file_path)).toBe(false)
            // The replacement already discovered the API tab (placeholders on top); the old run left no rows of its own,
            // the previous results are intact, and WEB (not discovered yet) shows its previous result.
            expect(
                await db().queryAll('SELECT id FROM test_results WHERE run_id = ?', ['prev-run'])
            ).toHaveLength(5)
            expect(await latestStatus('test-t3')).toMatchObject({
                status: 'passed',
                run_id: 'prev-run',
            })
            // A test that never ran keeps its pending row.
            expect(await latestStatus('test-t4')).toMatchObject({status: 'pending', run_id: null})

            const old = await api().get(`/api/pipeline/status/${oldPipelineRunId}`).expect(200)
            expect(old.body.data).toMatchObject({
                status: 'cancelled',
                stopReason: 'replaced',
                resultsKept: false,
            })
            expect(old.body.data.steps.map((s: any) => s.status)).toEqual(['skipped', 'skipped'])
            expect(cancelled.mock.calls[0][1]).toBe('replaced')
            expect(cancelled.mock.calls[0][3]).toBe(false)
            expect(notifyReplaced).toHaveBeenCalledTimes(1)
            expect(notifyStopped).not.toHaveBeenCalled()
            expect(notifyResult).not.toHaveBeenCalled()
        })

        it('a --wait caller (no notify) is not replaced: it queues and the 409 rule is unchanged for non-script callers', async () => {
            fakePlaywright({API: ['t1'], WEB: ['t3']})
            await api()
                .post('/api/pipeline/run')
                .send({pipeline: 'develop', source: 'script'})
                .expect(200)
            await waitFor(() => spawned.length === 1)

            await api()
                .post('/api/pipeline/run')
                .send({pipeline: 'develop', source: 'script', notify: true})
                .expect(202)
            await api().post('/api/pipeline/run').send({pipeline: 'develop'}).expect(409)

            expect(children[spawned[0]].kill).not.toHaveBeenCalled()
            expect(notifyReplaced).not.toHaveBeenCalled()
        })

        it('requires a JWT: 401 without a token and with a bad one, and nothing is stopped or started', async () => {
            fakePlaywright({API: ['t1'], WEB: ['t3']})
            await api()
                .post('/api/pipeline/run')
                .send({pipeline: 'develop', source: 'script', notify: true})
                .expect(200)
            await waitFor(() => spawned.length === 1)
            const body = {pipeline: 'develop', source: 'script', notify: true}

            await request(server.url).post('/api/pipeline/run').send(body).expect(401)
            await request(server.url)
                .post('/api/pipeline/run')
                .set('Authorization', 'Bearer not-a-token')
                .send(body)
                .expect(401)

            expect(children[spawned[0]].kill).not.toHaveBeenCalled()
            expect(server.serviceContainer.pipelineExecutionService.getQueue()).toEqual([])
            expect(notifyReplaced).not.toHaveBeenCalled()
        })

        it('with authentication disabled the endpoint stays open (local use), unlike /pipeline/stop', async () => {
            process.env.ENABLE_AUTH = 'false'
            expect(config.auth.enableAuth).toBe(false)
            fakePlaywright({API: ['t1'], WEB: ['t3']})

            await request(server.url)
                .post('/api/pipeline/run')
                .send({pipeline: 'develop', source: 'script'})
                .expect(200)
            await waitFor(() => spawned.length === 1)
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

        it('a restart after a keep-mode stop finished deletes nothing (both markers were cleared)', async () => {
            fakePlaywright({API: ['t1', 't2']})
            const run = await api()
                .post('/api/tests/run-all')
                .send({project: 'API', skipAutoDiscovery: true})
                .expect(200)
            const runId = run.body.data.runId
            await reporter.result(runId, 'new-t1', 'test-t1', 'API', 'passed').expect(200)
            await api().post('/api/pipeline/stop').send({}).expect(200)

            await server.serviceContainer.pipelineExecutionService.handleInterruptedOnStartup()

            expect(
                await db().queryAll('SELECT id FROM test_results WHERE run_id = ?', [runId])
            ).toHaveLength(1)
            expect(await runRow(runId)).toMatchObject({status: 'failed'})
        })

        it('a restart inside the stop window (marker still set) deletes the run, as restart cleanup always did; the stop then ends cleanly', async () => {
            fakePlaywright({API: ['t1', 't2']})
            const run = await api()
                .post('/api/tests/run-all')
                .send({project: 'API', skipAutoDiscovery: true})
                .expect(200)
            const runId = run.body.data.runId
            await reporter.result(runId, 'new-t1', 'test-t1', 'API', 'passed').expect(200)
            expect(await server.serviceContainer.settingsService.getInFlightRun()).not.toBeNull()

            const release = holdClose(runId)
            const stop = startStop()
            await waitFor(() => children[runId].kill.mock.calls.length > 0)
            await server.serviceContainer.pipelineExecutionService.handleInterruptedOnStartup()
            release()
            const response = await stop

            expect(response.status).toBe(200)
            expect(
                await db().queryAll('SELECT id FROM test_results WHERE run_id = ?', [runId])
            ).toEqual([])
            expect(await db().queryAll('SELECT id FROM test_runs WHERE id = ?', [runId])).toEqual(
                []
            )
        })
    })
})

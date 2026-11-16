/**
 * Live run state: the snapshot broadcast at spawn time, and long runs surviving the tracker's
 * 30-minute failsafe while their process is alive.
 */
import {describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi} from 'vitest'
import request from 'supertest'
import {EventEmitter} from 'events'
import {spawn, type ChildProcess} from 'child_process'
import type {TestServerInstance} from '../helpers/testServer'
import {setupTestServer, teardownTestServer, cleanDatabase} from '../helpers/testServer'
import {seedTestRuns} from '../helpers/database'
import {activeProcessesTracker} from '../../../services/activeProcesses.service'
import {runProcessRegistry} from '../../../services/runProcessRegistry.service'
import {getWebSocketManager, setWebSocketManager} from '../../../websocket/server'

const FILE = 'orders/create.spec.ts'
// Far above any real pid limit: kill(pid, 0) answers ESRCH, so the process counts as gone.
const DEAD_PID = 2_147_483_000

describe('Live run state (Integration)', () => {
    let server: TestServerInstance
    let spawned: Array<EventEmitter & {pid?: number}>
    let realChildren: ChildProcess[]
    let snapshots: ReturnType<typeof activeProcessesTracker.getConnectionStatus>[]
    const savedManager = getWebSocketManager()

    const api = () => ({
        post: (url: string) =>
            request(server.app).post(url).set('Authorization', `Bearer ${server.authToken}`),
    })

    const fakeSpawn = (pid?: number | 'real') => {
        vi.spyOn(
            server.serviceContainer.playwrightService as any,
            'spawnPlaywrightProcess'
        ).mockImplementation((() => {
            if (pid === 'real') {
                // A real detached process, so the registry's real liveness check runs.
                const real = spawn('sleep', ['60'], {detached: true, stdio: 'ignore'})
                realChildren.push(real)
                return real
            }
            const child = new EventEmitter() as EventEmitter & {pid?: number}
            child.pid = pid
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
        spawned = []
        realChildren = []
        snapshots = []
        // Records what a client would receive: the tracker state at broadcast time.
        setWebSocketManager({
            clients: new Map(),
            broadcast: () => {},
            broadcastConnectionStatus: () => {
                snapshots.push(activeProcessesTracker.getConnectionStatus())
            },
        } as any)
        await server.testRepository.dbManager.execute(
            `INSERT INTO test_catalog (project, test_id, name, file_path, discovered_at) VALUES ('', 'test-orders', 'make it', ?, ?)`,
            [FILE, new Date().toISOString()]
        )
    })
    afterEach(() => {
        vi.useRealTimers()
        for (const child of realChildren) {
            try {
                process.kill(-child.pid!, 'SIGKILL')
            } catch {
                // already gone
            }
        }
        for (const child of spawned) child.emit('close', 0)
        activeProcessesTracker.forceReset()
        setWebSocketManager(savedManager as any)
    })

    describe('snapshot at spawn time', () => {
        const listsRun = (runId: string) =>
            snapshots.some((s) => s.activeRuns.some((r) => r.id === runId))

        it('run-group: a snapshot listing the run is broadcast before the response', async () => {
            fakeSpawn()
            const res = await api().post('/api/tests/run-group').send({filePath: FILE}).expect(200)

            expect(listsRun(res.body.data.runId)).toBe(true)
        })

        it('run-all: a snapshot listing the run is broadcast before the response', async () => {
            fakeSpawn()
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'discoverTests'
            ).mockResolvedValue([])
            const res = await api().post('/api/tests/run-all').send({}).expect(200)

            expect(listsRun(res.body.data.runId)).toBe(true)
        })

        it('rerun: a snapshot listing the run is broadcast before the response', async () => {
            await seedTestRuns(server.testRepository.dbManager, [{id: 'r1', status: 'completed'}])
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES ('e1', 'test-orders', 'r1', 'make it', ?, 'failed', 1)`,
                [FILE]
            )
            fakeSpawn()
            const res = await api().post('/api/tests/e1/rerun').send({}).expect(200)

            expect(listsRun(res.body.data.runId)).toBe(true)
        })
    })

    describe('run type', () => {
        it('the reporter /process-start keeps the dashboard-registered run-group type and filePath', async () => {
            fakeSpawn()
            const res = await api().post('/api/tests/run-group').send({filePath: FILE}).expect(200)
            const runId = res.body.data.runId as string

            // What the reporter sends from onBegin: no filePath, and it calls every non-rerun run 'run-all'.
            activeProcessesTracker.addProcess({runId, type: 'run-all', totalTests: 4})

            const run = activeProcessesTracker.getConnectionStatus().activeRuns[0]
            expect(run.type).toBe('run-group')
            expect(run.details.filePath).toBe(FILE)
            expect(run.progress?.totalTests).toBe(4)
            expect(activeProcessesTracker.isRunAllActive()).toBe(false)
        })
    })

    describe('30-minute tracker failsafe', () => {
        const startRun = async () => {
            const res = await api().post('/api/tests/run-group').send({filePath: FILE}).expect(200)
            return res.body.data.runId as string
        }
        const jumpMinutes = (minutes: number) => {
            vi.useFakeTimers({toFake: ['Date']})
            vi.setSystemTime(new Date(Date.now() + minutes * 60_000))
        }

        it('keeps a 31-minute-old run with a live process in the snapshot and keeps its progress', async () => {
            fakeSpawn('real')
            const runId = await startRun()
            expect(runProcessRegistry.isAlive(runId)).toBe(true)

            jumpMinutes(31)

            expect(
                activeProcessesTracker.getConnectionStatus().activeRuns.map((r) => r.id)
            ).toEqual([runId])
            const test = {testId: 't1', name: 'one', filePath: FILE}
            expect(activeProcessesTracker.startTest(runId, test)).not.toBeNull()
            const progress = activeProcessesTracker.updateProgress(runId, {
                ...test,
                status: 'passed',
            })
            expect(progress?.completedTests).toBe(1)
        })

        it('still drops a 31-minute-old run whose process is gone', async () => {
            fakeSpawn(DEAD_PID)
            const runId = await startRun()
            expect(runProcessRegistry.isAlive(runId)).toBe(false)

            jumpMinutes(31)

            expect(activeProcessesTracker.getConnectionStatus().activeRuns).toHaveLength(0)
        })
    })
})

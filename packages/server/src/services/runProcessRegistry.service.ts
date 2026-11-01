import {ChildProcess} from 'child_process'
import {RUN_STOP} from '../config/constants'
import {Logger} from '../utils/logger.util'
import {signalGroup} from '../utils/processGroup.util'

export type RegisteredRunType = 'run-all' | 'run-group' | 'rerun'

export interface RegisteredRun {
    runId: string
    type: RegisteredRunType
    project?: string
    // Process group of the run (Playwright is spawned detached, so pid === pgid).
    pgid?: number
    // Run-all only: discovery rows newer than this belong to the run and are removed if it is stopped.
    pendingSince?: string
    startedAt: string
}

interface Entry extends RegisteredRun {
    child: ChildProcess
    closed: Promise<void>
    killTimer?: ReturnType<typeof setTimeout>
    release: () => void
}

const CANCELLED_KEPT = 500

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms)
        timer.unref?.()
    })
}

function pidExists(pid: number): boolean {
    try {
        process.kill(pid, 0)
        return true
    } catch (error) {
        // EPERM = exists but not ours
        return (error as NodeJS.ErrnoException).code === 'EPERM'
    }
}

// Gone = the child exited, or its pid and process group no longer exist. No pid and no exit = unknown, kept.
function isGone({child, pgid}: Entry): boolean {
    const exited = typeof child.exitCode === 'number' || !!child.signalCode
    if (pgid === undefined) return exited
    const groupAlive = pidExists(-pgid)
    if (exited) return !groupAlive
    return !pidExists(pgid) && !groupAlive
}

// runId -> ChildProcess (the busy source), cancel flags for reporter endpoints, and the stop generation.
export class RunProcessRegistry {
    private runs = new Map<string, Entry>()
    private cancelled = new Set<string>()
    private stopGeneration = 0
    private shuttingDown = false

    register(
        run: Omit<RegisteredRun, 'pgid' | 'startedAt'>,
        child: ChildProcess | undefined
    ): void {
        if (!child) return

        let markClosed!: () => void
        const closed = new Promise<void>((resolve) => {
            markClosed = resolve
        })
        const entry: Entry = {
            ...run,
            pgid: child.pid,
            startedAt: new Date().toISOString(),
            child,
            closed,
            release: () => done(),
        }

        const done = () => {
            if (entry.killTimer) clearTimeout(entry.killTimer)
            // Only drop the entry that is still ours (a rerun of the same id would be a new spawn).
            if (this.runs.get(run.runId) === entry) this.runs.delete(run.runId)
            markClosed()
        }

        // Already gone: 'close' will not fire again.
        if (typeof child.exitCode === 'number' || child.signalCode) {
            markClosed()
            return
        }

        this.runs.set(run.runId, entry)
        child.once('close', done)
        // A spawn that failed has no pid and may never emit 'close'.
        child.once('error', () => {
            if (child.pid === undefined) done()
        })
    }

    isAnyRunning(): boolean {
        return this.runs.size > 0
    }

    has(runId: string): boolean {
        return this.runs.has(runId)
    }

    getRuns(): RegisteredRun[] {
        return Array.from(
            this.runs.values(),
            ({child: _child, closed: _closed, killTimer: _t, release: _r, ...run}) => run
        )
    }

    /**
     * Force-reset: drops entries whose process is gone but never sent `close` (they keep the
     * dashboard busy forever). A live child or group is never touched. Returns the dropped runIds.
     */
    clearDead(): string[] {
        const cleared: string[] = []
        for (const entry of Array.from(this.runs.values())) {
            if (!isGone(entry)) continue
            Logger.warn(`Force reset: dropping dead run ${entry.runId} (process is gone)`)
            entry.release()
            cleared.push(entry.runId)
        }
        return cleared
    }

    getPgids(): number[] {
        return Array.from(this.runs.values()).flatMap((e) => (e.pgid ? [e.pgid] : []))
    }

    /** Resolves when the run's child has closed (immediately when it is not registered). */
    whenClosed(runId: string): Promise<void> {
        return this.runs.get(runId)?.closed ?? Promise.resolve()
    }

    // SIGINT the group, SIGKILL after killAfterMs; resolves on close or closeGiveUpMs after the SIGKILL.
    terminate(
        runId: string,
        killAfterMs: number = RUN_STOP.KILL_AFTER_MS,
        closeGiveUpMs: number = RUN_STOP.CLOSE_GIVE_UP_MS
    ): Promise<void> {
        const entry = this.runs.get(runId)
        if (!entry) return Promise.resolve()

        this.signal(entry, 'SIGINT')
        if (!entry.killTimer) {
            entry.killTimer = setTimeout(() => {
                Logger.warn(`Run ${runId} ignored SIGINT for ${killAfterMs} ms, sending SIGKILL`)
                this.signal(entry, 'SIGKILL')
            }, killAfterMs)
            entry.killTimer.unref?.()
        }

        return Promise.race([
            entry.closed,
            delay(killAfterMs + closeGiveUpMs).then(() => {
                if (this.runs.get(runId) === entry) {
                    Logger.error(`Run ${runId} did not close after SIGKILL, giving up waiting`)
                }
            }),
        ])
    }

    /** Server shutdown: SIGINT every group, SIGKILL whatever is left after graceMs. */
    async terminateAll(graceMs: number = RUN_STOP.SHUTDOWN_GRACE_MS): Promise<void> {
        this.shuttingDown = true
        const entries = Array.from(this.runs.values())
        if (entries.length === 0) return

        Logger.info(`Stopping ${entries.length} Playwright run(s) for shutdown`)
        for (const entry of entries) this.signal(entry, 'SIGINT')

        await Promise.race([Promise.all(entries.map((e) => e.closed)), delay(graceMs)])

        for (const entry of this.runs.values()) {
            Logger.warn(`Run ${entry.runId} still alive at shutdown, sending SIGKILL`)
            this.signal(entry, 'SIGKILL')
        }
    }

    isShuttingDown(): boolean {
        return this.shuttingDown
    }

    /** A Stop was requested: starts that captured an older generation must not spawn. */
    beginStop(): number {
        return ++this.stopGeneration
    }

    getStopGeneration(): number {
        return this.stopGeneration
    }

    markCancelled(runIds: string[]): void {
        for (const id of runIds) this.cancelled.add(id)
        while (this.cancelled.size > CANCELLED_KEPT) {
            const oldest = this.cancelled.values().next().value
            if (oldest === undefined) break
            this.cancelled.delete(oldest)
        }
    }

    isCancelled(runId: string): boolean {
        return this.cancelled.has(runId)
    }

    private signal(entry: Entry, signal: NodeJS.Signals): void {
        if (entry.pgid && signalGroup(entry.pgid, signal)) return
        // No group to signal (not spawned detached, or already gone): at least reach the child itself.
        if (typeof entry.child.exitCode !== 'number' && !entry.child.signalCode) {
            entry.child.kill(signal)
        }
    }
}

export const runProcessRegistry = new RunProcessRegistry()

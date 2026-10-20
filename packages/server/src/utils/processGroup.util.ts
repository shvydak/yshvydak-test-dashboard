import {execFile} from 'child_process'
import {Logger} from './logger.util'

// Clock and `ps` etime are both whole seconds; a few more absorb rounding and the marker being written just after the spawn.
const START_SLACK_MS = 10_000

/** Sends `signal` to a whole process group; false when the group no longer exists. */
export function signalGroup(pgid: number, signal: NodeJS.Signals): boolean {
    try {
        process.kill(-pgid, signal)
        return true
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
            Logger.warn(`Could not send ${signal} to process group ${pgid}`, error)
        }
        return false
    }
}

interface ProcessRow {
    pgid: number
    ageMs: number | null
    command: string
}

// `ps` etime is [[dd-]hh:]mm:ss on both Linux and macOS (etimes is Linux-only).
function parseEtime(etime: string): number | null {
    const match = etime.match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/)
    if (!match) return null
    const [, days, hours, minutes, seconds] = match
    return (
        (Number(days ?? 0) * 86400 +
            Number(hours ?? 0) * 3600 +
            Number(minutes) * 60 +
            Number(seconds)) *
        1000
    )
}

function listProcesses(): Promise<ProcessRow[]> {
    return new Promise((resolve) => {
        execFile(
            'ps',
            ['-A', '-o', 'pgid=,etime=,command='],
            {maxBuffer: 16 * 1024 * 1024},
            (error, stdout) => {
                if (error) {
                    Logger.warn(
                        'Could not list processes to check leftover Playwright groups',
                        error
                    )
                    resolve([])
                    return
                }
                const rows: ProcessRow[] = []
                for (const line of stdout.split('\n')) {
                    const match = line.match(/^\s*(\d+)\s+(\S+)\s+(.*)$/)
                    if (match) {
                        rows.push({
                            pgid: Number(match[1]),
                            ageMs: parseEtime(match[2]),
                            command: match[3],
                        })
                    }
                }
                resolve(rows)
            }
        )
    })
}

export interface LeftoverGroup {
    pgid: number
    // When the marker was written: a process younger than this cannot be the marker's run (a reused group id).
    markerWrittenAt?: string
}

// Only groups with a Playwright member that predates the marker are killed (a stale marker may name a reused group id).
export async function killLeftoverPlaywrightGroups(groups: LeftoverGroup[]): Promise<number[]> {
    const wanted = groups.filter((g) => Number.isInteger(g.pgid) && g.pgid > 1)
    if (wanted.length === 0) return []

    const processes = await listProcesses()
    const now = Date.now()
    const killed: number[] = []
    for (const {pgid, markerWrittenAt} of wanted) {
        const members = processes.filter((p) => p.pgid === pgid)
        if (members.length === 0) continue

        const markerMs = markerWrittenAt ? new Date(markerWrittenAt).getTime() : NaN
        const playwrightMembers = members.filter((p) => /playwright/i.test(p.command))
        const predatesMarker = playwrightMembers.some(
            (p) =>
                Number.isNaN(markerMs) ||
                (p.ageMs !== null && now - p.ageMs <= markerMs + START_SLACK_MS)
        )
        if (!predatesMarker) {
            Logger.warn(
                `Process group ${pgid} from the in-flight marker is not that run's Playwright, left alone`
            )
            continue
        }
        if (signalGroup(pgid, 'SIGKILL')) killed.push(pgid)
    }
    return killed
}

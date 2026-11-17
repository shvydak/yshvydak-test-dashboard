import {useCallback, useEffect, useRef, useState} from 'react'
import {authGet} from '@features/authentication/utils/authFetch'
import {LIVE_COUNTS_REFRESH_DELAY_MS} from '@features/tests/store/testsStore'
import {config} from '@config/environment.config'

export type PipelineStepStatus = 'queued' | 'running' | 'success' | 'failed' | 'skipped'

export interface PipelineStep {
    project: string
    displayName: string
    stopOnFailure: boolean
    status: PipelineStepStatus
    runId?: string
    passed?: number
    failed?: number
    /** Failed step of a stopped pipeline, live from the server: failed tests of its run and how many still fail now. */
    failedTotal?: number
    stillFailing?: number
}

export type PipelineRunStatus = 'running' | 'completed' | 'stopped_early' | 'paused' | 'cancelled'

export interface PipelineState {
    pipelineRunId: string
    pipeline?: string
    status: PipelineRunStatus
    steps: PipelineStep[]
    startedAt: string
    source?: string
    notify?: boolean
}

/** A CI request waiting for the dashboard to become idle (one slot per pipeline name). */
export interface QueuedPipeline {
    pipeline: string
    maxWorkers?: number
    queuedAt: string
}

export interface UsePipelineStatusReturn {
    pipeline: PipelineState | null
    queue: QueuedPipeline[]
    /** A Stop is cleaning up; the Stop button shows "Stopping...". */
    stopping: boolean
    applyPipelineEvent: (type: string, data: any) => void
    /** Re-reads pipeline + queue from the server; call after a WebSocket (re)connect. */
    resync: () => void
    /** A test result changed: re-reads the "still failing" counts (throttled, paused while the tab is hidden). */
    refreshFailures: () => void
}

const PIPELINE_STATE_EVENTS = new Set([
    'pipeline:started',
    'pipeline:step-started',
    'pipeline:step-completed',
    'pipeline:completed',
])

/**
 * Tracks the live CI pipeline run so the tab bar can show per-project
 * running/queued/success/failed indicators. Rehydrates on mount and on every
 * WebSocket reconnect (resync), and is otherwise driven by WebSocket events via
 * applyPipelineEvent. Also tracks the CI request queue the same way.
 */
export function usePipelineStatus(isAuthenticated = true): UsePipelineStatusReturn {
    const [pipeline, setPipeline] = useState<PipelineState | null>(null)
    const [queue, setQueue] = useState<QueuedPipeline[]>([])
    const [stopping, setStopping] = useState(false)
    // A slower, older reply must not overwrite a newer one.
    const requestSeq = useRef(0)
    // Bumped by pipeline-state events: a reply read before one is re-fetched, not applied.
    const eventSeq = useRef(0)
    const resyncRef = useRef<() => void>(() => {})

    // Replaces local state with the server's: events missed while offline must not leave a stale "running".
    const resync = useCallback(() => {
        if (!isAuthenticated) return

        const seq = ++requestSeq.current
        const eventsAtStart = eventSeq.current
        // True when the reply must not be applied; an event-made one is re-read.
        const outdated = () => {
            if (seq !== requestSeq.current) return true
            if (eventsAtStart === eventSeq.current) return false
            resyncRef.current()
            return true
        }
        authGet(`${config.api.baseUrl}/pipeline/status/current`)
            .then(async (res) => {
                if (outdated()) return
                if (res.status === 404) {
                    // Nothing running, nothing queued (also after a server restart).
                    setPipeline(null)
                    setQueue([])
                    setStopping(false)
                    return
                }
                if (!res.ok) return
                const data = await res.json()
                if (outdated()) return
                setPipeline(data?.data ?? null)
                setQueue(Array.isArray(data?.queue) ? data.queue : [])
                setStopping(data?.stopping === true)
            })
            .catch(() => {
                // Request failed — keep the current state
            })
    }, [isAuthenticated])
    resyncRef.current = resync

    useEffect(() => {
        resync()
    }, [resync])

    // Only a stopped pipeline with a failed step has counts to keep fresh.
    const pipelineRef = useRef(pipeline)
    pipelineRef.current = pipeline
    const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const refreshPendingWhileHidden = useRef(false)

    const refreshFailures = useCallback(() => {
        const current = pipelineRef.current
        if (
            current?.status !== 'stopped_early' ||
            !current.steps.some((s) => s.status === 'failed')
        )
            return
        if (refreshTimer.current) return
        refreshTimer.current = setTimeout(() => {
            refreshTimer.current = null
            // A hidden tab skips the fetch and catches up once when visible again.
            if (document.hidden) {
                refreshPendingWhileHidden.current = true
                return
            }
            resync()
        }, LIVE_COUNTS_REFRESH_DELAY_MS)
    }, [resync])

    useEffect(() => {
        const onVisible = () => {
            if (document.hidden || !refreshPendingWhileHidden.current) return
            refreshPendingWhileHidden.current = false
            resync()
        }
        document.addEventListener('visibilitychange', onVisible)
        return () => {
            document.removeEventListener('visibilitychange', onVisible)
            if (refreshTimer.current) clearTimeout(refreshTimer.current)
            refreshTimer.current = null
        }
    }, [resync])

    const applyPipelineEvent = useCallback(
        (type: string, data: any) => {
            if (PIPELINE_STATE_EVENTS.has(type)) eventSeq.current++
            switch (type) {
                case 'pipeline:started':
                    setPipeline({
                        pipelineRunId: data.pipelineRunId,
                        status: 'running',
                        steps: data.steps,
                        startedAt: new Date().toISOString(),
                    })
                    break

                case 'pipeline:step-started':
                    setPipeline((prev) => {
                        if (!prev || prev.pipelineRunId !== data.pipelineRunId) return prev
                        return {
                            ...prev,
                            steps: prev.steps.map((s) =>
                                s.project === data.project
                                    ? {...s, status: 'running', runId: data.runId}
                                    : s
                            ),
                        }
                    })
                    break

                case 'pipeline:step-completed':
                    setPipeline((prev) => {
                        if (!prev || prev.pipelineRunId !== data.pipelineRunId) return prev
                        return {
                            ...prev,
                            steps: prev.steps.map((s) =>
                                s.project === data.step.project ? data.step : s
                            ),
                        }
                    })
                    break

                case 'pipeline:completed':
                    setPipeline((prev) => {
                        if (!prev || prev.pipelineRunId !== data.pipelineRunId) return prev
                        return {...prev, status: data.status, steps: data.steps}
                    })
                    // The event's steps carry no live counts.
                    if (data.status === 'stopped_early') resync()
                    break

                case 'pipeline:queue-changed':
                    setQueue(Array.isArray(data?.queue) ? data.queue : [])
                    break

                case 'run:stopping':
                    setStopping(true)
                    break

                case 'run:cancelled':
                    setStopping(false)
                    break

                default:
                // Not a pipeline event - ignore
            }
        },
        [resync]
    )

    return {pipeline, queue, stopping, applyPipelineEvent, resync, refreshFailures}
}

import {useCallback, useEffect, useState} from 'react'
import {authGet} from '@features/authentication/utils/authFetch'
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
}

export type PipelineRunStatus = 'running' | 'completed' | 'stopped_early' | 'paused'

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
    applyPipelineEvent: (type: string, data: any) => void
    /** Re-reads pipeline + queue from the server; call after a WebSocket (re)connect. */
    resync: () => void
}

/**
 * Tracks the live CI pipeline run so the tab bar can show per-project
 * running/queued/success/failed indicators. Rehydrates on mount and on every
 * WebSocket reconnect (resync), and is otherwise driven by WebSocket events via
 * applyPipelineEvent. Also tracks the CI request queue the same way.
 */
export function usePipelineStatus(isAuthenticated = true): UsePipelineStatusReturn {
    const [pipeline, setPipeline] = useState<PipelineState | null>(null)
    const [queue, setQueue] = useState<QueuedPipeline[]>([])

    // Replaces local state with the server's: events missed while offline must not leave a stale "running".
    const resync = useCallback(() => {
        if (!isAuthenticated) return

        authGet(`${config.api.baseUrl}/pipeline/status/current`)
            .then(async (res) => {
                if (res.status === 404) {
                    // Nothing running, nothing queued (also after a server restart).
                    setPipeline(null)
                    setQueue([])
                    return
                }
                if (!res.ok) return
                const data = await res.json()
                setPipeline(data?.data ?? null)
                setQueue(Array.isArray(data?.queue) ? data.queue : [])
            })
            .catch(() => {
                // Request failed — keep the current state
            })
    }, [isAuthenticated])

    useEffect(() => {
        resync()
    }, [resync])

    const applyPipelineEvent = useCallback((type: string, data: any) => {
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
                break

            case 'pipeline:queue-changed':
                setQueue(Array.isArray(data?.queue) ? data.queue : [])
                break

            default:
            // Not a pipeline event - ignore
        }
    }, [])

    return {pipeline, queue, applyPipelineEvent, resync}
}

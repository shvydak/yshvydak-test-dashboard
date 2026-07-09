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

export type PipelineRunStatus = 'running' | 'completed' | 'stopped_early'

export interface PipelineState {
    pipelineRunId: string
    status: PipelineRunStatus
    steps: PipelineStep[]
    startedAt: string
}

export interface UsePipelineStatusReturn {
    pipeline: PipelineState | null
    applyPipelineEvent: (type: string, data: any) => void
}

/**
 * Tracks the live CI pipeline run so the tab bar can show per-project
 * running/queued/success/failed indicators. Rehydrates once on mount (in case
 * a pipeline is already in flight after a page refresh) and is otherwise
 * driven entirely by WebSocket events via applyPipelineEvent.
 */
export function usePipelineStatus(isAuthenticated = true): UsePipelineStatusReturn {
    const [pipeline, setPipeline] = useState<PipelineState | null>(null)

    useEffect(() => {
        if (!isAuthenticated) return

        authGet(`${config.api.baseUrl}/pipeline/status/current`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data?.data) setPipeline(data.data)
            })
            .catch(() => {
                // No pipeline has run yet, or the request failed — start with no state
            })
    }, [isAuthenticated])

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

            default:
            // Not a pipeline event - ignore
        }
    }, [])

    return {pipeline, applyPipelineEvent}
}

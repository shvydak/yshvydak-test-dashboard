import {useState} from 'react'
import {SkipForward} from 'lucide-react'
import {AlertBanner} from '@shared/components/molecules/AlertBanner'
import type {PipelineState} from '@/hooks/usePipelineStatus'

interface PipelineSkippedBannerProps {
    pipeline: PipelineState | null
    onViewProject: (project: string) => void
}

/**
 * Surfaces the CI pipeline's "stop on failure" outcome — otherwise a skipped
 * step just silently never runs, with nothing in the UI explaining why.
 * The server counts how many of the failed step's failed tests still fail now;
 * at 0 the banner disappears for everyone. The X hides it only until a reload
 * (never persisted), keyed by pipelineRunId.
 */
export function PipelineSkippedBanner({pipeline, onViewProject}: PipelineSkippedBannerProps) {
    const [dismissedRunId, setDismissedRunId] = useState<string | null>(null)

    if (!pipeline || pipeline.status !== 'stopped_early') return null
    if (pipeline.pipelineRunId === dismissedRunId) return null

    // The last failed step is the one that stopped the pipeline; earlier failures were non-blocking.
    const failedStep = [...pipeline.steps].reverse().find((s) => s.status === 'failed')
    const skippedSteps = pipeline.steps.filter((s) => s.status === 'skipped')
    if (!failedStep || skippedSteps.length === 0) return null
    if (failedStep.stillFailing === 0) return null

    const title =
        skippedSteps.length === 1
            ? `${skippedSteps[0].displayName} was skipped`
            : `${skippedSteps.length} pipeline steps were skipped`
    const stopMessage = `${failedStep.displayName} failed and the pipeline is set to stop on failure`
    const message =
        failedStep.stillFailing === undefined || failedStep.failedTotal === undefined
            ? stopMessage
            : `${stopMessage} — ${failedStep.stillFailing} of ${failedStep.failedTotal} failed tests still failing`

    return (
        <AlertBanner
            severity="warning"
            icon={<SkipForward className="h-4 w-4" />}
            title={title}
            message={message}
            primaryAction={{
                label: `View ${failedStep.displayName} results`,
                onClick: () => onViewProject(failedStep.project),
            }}
            onDismiss={() => setDismissedRunId(pipeline.pipelineRunId)}
        />
    )
}

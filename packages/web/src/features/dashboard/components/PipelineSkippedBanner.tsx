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
 * Dismissal is keyed by pipelineRunId so a new pipeline run always re-shows it.
 */
export function PipelineSkippedBanner({pipeline, onViewProject}: PipelineSkippedBannerProps) {
    const [dismissedRunId, setDismissedRunId] = useState<string | null>(null)

    if (!pipeline || pipeline.status !== 'stopped_early') return null
    if (pipeline.pipelineRunId === dismissedRunId) return null

    const failedStep = pipeline.steps.find((s) => s.status === 'failed')
    const skippedSteps = pipeline.steps.filter((s) => s.status === 'skipped')
    if (!failedStep || skippedSteps.length === 0) return null

    const title =
        skippedSteps.length === 1
            ? `${skippedSteps[0].displayName} was skipped`
            : `${skippedSteps.length} pipeline steps were skipped`
    const message = `${failedStep.displayName} failed and the pipeline is set to stop on failure`

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

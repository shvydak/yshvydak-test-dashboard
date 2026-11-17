import {useEffect, useState} from 'react'
import {Clock, Square} from 'lucide-react'
import {AlertBanner} from '@shared/components/molecules/AlertBanner'
import {formatTimeAgo} from '@features/tests/utils/formatters'
import {specFileName} from '@features/tests/utils/stopTarget'
import type {LastStop, PipelineStep} from '@/hooks/usePipelineStatus'

interface StoppedRunBannerProps {
    lastStop: LastStop | null
}

const AGO_REFRESH_MS = 30_000

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function stepCounts(step: PipelineStep): string {
    if (step.passed === undefined && step.failed === undefined) return step.displayName
    const passed = `${step.passed ?? 0} passed`
    const failed = step.failed ? `, ${step.failed} failed` : ''
    return `${step.displayName}: ${passed}${failed}`
}

function stepsMessage(steps: PipelineStep[]): string {
    const ran = steps.filter((s) => ['success', 'failed', 'stopped'].includes(s.status))
    const notRun = steps.filter((s) => s.status === 'skipped' || s.status === 'queued')
    const parts = [
        ...ran.map(stepCounts),
        ...(notRun.length ? [`${notRun.map((s) => s.displayName).join(', ')} not run`] : []),
    ]
    return `${parts.length ? `${parts.join(' · ')}. ` : ''}Results so far are kept.`
}

// What was stopped, as one noun phrase ("Develop pipeline", "Run All — API").
function targetLabel({kind, name}: LastStop): string {
    switch (kind) {
        case 'pipeline':
            return name ? `${capitalize(name)} pipeline` : 'Pipeline'
        case 'run-all':
            return name ? `Run All — ${name}` : 'Run All'
        case 'run-group':
            return name ? `Run of ${specFileName(name)}` : 'Run of a file'
        case 'rerun':
            return name ? `Rerun of ${name}` : 'Rerun'
        default:
            return 'Run'
    }
}

// "now" for the relative time, refreshed while the banner is open.
function useNow(active: boolean): number {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        if (!active) return
        setNow(Date.now())
        const timer = setInterval(() => setNow(Date.now()), AGO_REFRESH_MS)
        return () => clearInterval(timer)
    }, [active])
    return now
}

// The server's last kept stop, the same for every tab; the X lasts until reload (a newer stop shows again).
export function StoppedRunBanner({lastStop}: StoppedRunBannerProps) {
    const [hiddenStoppedAt, setHiddenStoppedAt] = useState<string | null>(null)
    const shown = !!lastStop && lastStop.stoppedAt !== hiddenStoppedAt
    const now = useNow(shown)

    if (!lastStop || !shown) return null

    const isTimeout = lastStop.reason === 'timeout'
    const how = isTimeout
        ? lastStop.timeLimitMinutes
            ? `stopped after ${lastStop.timeLimitMinutes} min (time limit)`
            : 'stopped (time limit)'
        : 'stopped manually'
    const stoppedSteps = (lastStop.steps ?? []).filter((s) => s.status === 'stopped')
    return (
        <AlertBanner
            severity="neutral"
            icon={
                isTimeout ? (
                    <Clock className="h-4 w-4" />
                ) : (
                    <Square className="h-4 w-4 fill-current" />
                )
            }
            title={`${targetLabel(lastStop)} ${how} · ${formatTimeAgo(lastStop.stoppedAt, now)}`}
            message={lastStop.steps ? stepsMessage(lastStop.steps) : 'Results so far are kept.'}
            extra={stoppedSteps.map((step) => (
                <span
                    key={step.project}
                    className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-white/10 dark:text-gray-200">
                    {step.displayName}: Stopped
                </span>
            ))}
            onDismiss={() => setHiddenStoppedAt(lastStop.stoppedAt)}
        />
    )
}

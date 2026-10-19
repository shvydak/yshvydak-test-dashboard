import type {PipelineFinishStatus, PipelineStepSummary} from '../services/websocket.service'
import {getCIPipelineLabel} from './ciPipeline.util'

const SEPARATOR = '-'.repeat(80)

export type CIPipelineOutcome =
    | 'completed_success'
    | 'completed_with_failures'
    | 'stopped_early'
    | 'paused'

export interface CISlackContext {
    pipeline: string
    // Link base without trailing slash; empty → messages carry no link line.
    dashboardUrl: string
}

const stepName = (step: PipelineStepSummary): string => step.displayName || step.project

function testsUrl(ctx: CISlackContext, slug?: string): string {
    const base = `${ctx.dashboardUrl}/tests`
    return slug ? `${base}?project=${encodeURIComponent(slug)}` : base
}

// One-step pipelines deep-link to that tab; several tabs → the unscoped list (?project= takes one value).
function pipelineLink(ctx: CISlackContext, projects: string[]): string {
    return testsUrl(ctx, projects.length === 1 ? projects[0] : undefined)
}

function block(ctx: CISlackContext, title: string, body: string | undefined): string {
    const lines = [SEPARATOR, `🧪 Automated tests · ${getCIPipelineLabel(ctx.pipeline)}`, title]
    if (body) lines.push(body)
    lines.push(SEPARATOR)
    return lines.join('\n')
}

const linkLine = (ctx: CISlackContext, url: string): string | undefined =>
    ctx.dashboardUrl ? `🔗 ${url}` : undefined

export function classifyPipelineOutcome(
    status: PipelineFinishStatus,
    steps: PipelineStepSummary[]
): CIPipelineOutcome {
    if (status === 'stopped_early' || status === 'paused') return status
    const totalFailed = steps.reduce((sum, s) => sum + (s.failed || 0), 0)
    return totalFailed > 0 ? 'completed_with_failures' : 'completed_success'
}

export function buildResultMessage(
    ctx: CISlackContext,
    status: PipelineFinishStatus,
    steps: PipelineStepSummary[]
): string {
    const projects = steps.map((s) => s.project)
    const outcome = classifyPipelineOutcome(status, steps)

    if (outcome === 'paused') {
        return block(
            ctx,
            '⏸️ Paused — remaining steps were skipped',
            linkLine(ctx, pipelineLink(ctx, projects))
        )
    }

    if (outcome === 'stopped_early') {
        // The last failed step stopped the pipeline; earlier failures were non-blocking.
        const failedStep = [...steps].reverse().find((s) => s.status === 'failed')
        const title = `⛔ Stopped at ${failedStep ? stepName(failedStep) : 'unknown tab'} — remaining steps were skipped`
        const url = failedStep ? testsUrl(ctx, failedStep.project) : pipelineLink(ctx, projects)
        return block(ctx, title, linkLine(ctx, url))
    }

    if (outcome === 'completed_with_failures') {
        const failedSteps = steps.filter((s) => (s.failed || 0) > 0)
        const failedTotal = failedSteps.reduce((sum, s) => sum + (s.failed || 0), 0)
        const word = failedTotal === 1 ? 'test' : 'tests'
        const title = `⚠️ ${failedTotal} ${word} failed in ${failedSteps.map(stepName).join(', ')}`
        const url =
            failedSteps.length === 1
                ? testsUrl(ctx, failedSteps[0].project)
                : pipelineLink(ctx, projects)
        return block(ctx, title, linkLine(ctx, url))
    }

    return block(ctx, '✅ Test run passed', linkLine(ctx, pipelineLink(ctx, projects)))
}

export function buildTimeoutMessage(ctx: CISlackContext, projects: string[]): string {
    return block(
        ctx,
        '⏱️ Timed out — dashboard did not report completion',
        linkLine(ctx, pipelineLink(ctx, projects))
    )
}

export function buildInterruptedMessage(ctx: CISlackContext, projects: string[]): string {
    return block(
        ctx,
        '⚠️ Test run was interrupted — the dashboard restarted',
        linkLine(ctx, pipelineLink(ctx, projects))
    )
}

export function buildPausedMessage(ctx: CISlackContext, message?: string): string {
    return block(
        ctx,
        '⏸️ Auto-run is paused — tests were not started',
        message || 'CI auto-run is paused in Settings.'
    )
}

export function buildNotStartedMessage(
    ctx: CISlackContext,
    reason: string,
    message?: string
): string {
    return block(ctx, `❌ Did not start (${reason})`, message || 'See dashboard logs for details.')
}

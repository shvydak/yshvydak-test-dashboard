export const CI_PIPELINE_NAMES = ['develop', 'production'] as const

export type CIPipelineName = (typeof CI_PIPELINE_NAMES)[number]

export const DEFAULT_CI_PIPELINE: CIPipelineName = 'develop'

export function isCIPipelineName(value: unknown): value is CIPipelineName {
    return typeof value === 'string' && (CI_PIPELINE_NAMES as readonly string[]).includes(value)
}

/**
 * Resolve the pipeline to run. Missing/empty → develop (keeps existing CI callers working).
 * Unknown names return null so the API can 400 instead of silently running the wrong set.
 */
export function parseCIPipelineName(value: unknown): CIPipelineName | null {
    if (value === undefined || value === null || value === '') {
        return DEFAULT_CI_PIPELINE
    }
    return isCIPipelineName(value) ? value : null
}

/**
 * Normalize a tab's pipeline membership.
 * New shape: `pipelines: ['develop', 'production']`.
 * Legacy `inPipeline: true` becomes `['develop']` so existing Settings data keeps running after deploy.
 */
export function normalizeCIPipelines(
    pipelines: unknown,
    legacyInPipeline?: unknown
): CIPipelineName[] {
    if (Array.isArray(pipelines)) {
        const selected = new Set<CIPipelineName>()
        for (const item of pipelines) {
            if (isCIPipelineName(item)) selected.add(item)
        }
        return CI_PIPELINE_NAMES.filter((name) => selected.has(name))
    }

    if (Boolean(legacyInPipeline)) {
        return [DEFAULT_CI_PIPELINE]
    }

    return []
}

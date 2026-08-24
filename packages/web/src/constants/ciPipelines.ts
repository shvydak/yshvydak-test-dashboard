export const CI_PIPELINE_NAMES = ['develop', 'production'] as const

export type CIPipelineName = (typeof CI_PIPELINE_NAMES)[number]

export function normalizeCIPipelines(
    pipelines: unknown,
    legacyInPipeline?: unknown
): CIPipelineName[] {
    if (Array.isArray(pipelines)) {
        const selected = new Set<CIPipelineName>()
        for (const item of pipelines) {
            if ((CI_PIPELINE_NAMES as readonly string[]).includes(item)) {
                selected.add(item as CIPipelineName)
            }
        }
        return CI_PIPELINE_NAMES.filter((name) => selected.has(name))
    }

    if (Boolean(legacyInPipeline)) {
        return ['develop']
    }

    return []
}

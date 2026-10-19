import {describe, expect, it} from 'vitest'
import {
    CI_PIPELINE_DRAIN_ORDER,
    DEFAULT_CI_PIPELINE,
    getCIPipelineLabel,
    normalizeCIPipelines,
    parseCIPipelineName,
} from '../ciPipeline.util'

describe('parseCIPipelineName', () => {
    it('defaults missing values to develop', () => {
        expect(parseCIPipelineName(undefined)).toBe(DEFAULT_CI_PIPELINE)
        expect(parseCIPipelineName(null)).toBe(DEFAULT_CI_PIPELINE)
        expect(parseCIPipelineName('')).toBe(DEFAULT_CI_PIPELINE)
    })

    it('accepts known names', () => {
        expect(parseCIPipelineName('develop')).toBe('develop')
        expect(parseCIPipelineName('production')).toBe('production')
    })

    it('rejects unknown names', () => {
        expect(parseCIPipelineName('staging')).toBeNull()
        expect(parseCIPipelineName('Develop')).toBeNull()
    })
})

describe('normalizeCIPipelines', () => {
    it('filters to known names in stable order', () => {
        expect(normalizeCIPipelines(['production', 'develop', 'other'])).toEqual([
            'develop',
            'production',
        ])
    })

    it('treats a missing list as empty', () => {
        expect(normalizeCIPipelines(undefined)).toEqual([])
        expect(normalizeCIPipelines(undefined, false)).toEqual([])
    })

    it('migrates legacy inPipeline=true to develop', () => {
        expect(normalizeCIPipelines(undefined, true)).toEqual(['develop'])
        expect(normalizeCIPipelines(undefined, 'yes')).toEqual(['develop'])
    })

    it('prefers the pipelines array over the legacy flag', () => {
        expect(normalizeCIPipelines(['production'], true)).toEqual(['production'])
    })
})

describe('getCIPipelineLabel', () => {
    it('maps the known pipelines to their Slack labels', () => {
        expect(getCIPipelineLabel('develop')).toBe('Development')
        expect(getCIPipelineLabel('production')).toBe('Production')
    })

    it('shows an unknown name as-is', () => {
        expect(getCIPipelineLabel('staging')).toBe('staging')
    })
})

describe('CI_PIPELINE_DRAIN_ORDER', () => {
    it('drains production before develop', () => {
        expect(CI_PIPELINE_DRAIN_ORDER).toEqual(['production', 'develop'])
    })
})

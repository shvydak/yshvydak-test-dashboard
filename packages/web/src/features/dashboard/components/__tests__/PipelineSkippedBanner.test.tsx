import {describe, it, expect, vi} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import {PipelineSkippedBanner} from '../PipelineSkippedBanner'
import type {PipelineState} from '@/hooks/usePipelineStatus'

function makePipeline(overrides: Partial<PipelineState> = {}): PipelineState {
    return {
        pipelineRunId: 'run-1',
        status: 'stopped_early',
        startedAt: '2026-01-01T00:00:00.000Z',
        steps: [
            {
                project: 'API_Tests',
                displayName: 'API Tests',
                stopOnFailure: true,
                status: 'failed',
            },
            {
                project: 'WEB_Tests',
                displayName: 'WEB Tests',
                stopOnFailure: false,
                status: 'skipped',
            },
        ],
        ...overrides,
    }
}

describe('PipelineSkippedBanner', () => {
    it('renders nothing when there is no pipeline', () => {
        const {container} = render(
            <PipelineSkippedBanner pipeline={null} onViewProject={vi.fn()} />
        )
        expect(container).toBeEmptyDOMElement()
    })

    it('renders nothing when the pipeline is still running', () => {
        const pipeline = makePipeline({status: 'running'})
        const {container} = render(
            <PipelineSkippedBanner pipeline={pipeline} onViewProject={vi.fn()} />
        )
        expect(container).toBeEmptyDOMElement()
    })

    it('renders nothing when the pipeline completed without any skipped step', () => {
        const pipeline = makePipeline({
            status: 'completed',
            steps: [
                {
                    project: 'API_Tests',
                    displayName: 'API Tests',
                    stopOnFailure: true,
                    status: 'success',
                },
            ],
        })
        const {container} = render(
            <PipelineSkippedBanner pipeline={pipeline} onViewProject={vi.fn()} />
        )
        expect(container).toBeEmptyDOMElement()
    })

    it('shows the skipped step name and the failed step that caused it', () => {
        render(<PipelineSkippedBanner pipeline={makePipeline()} onViewProject={vi.fn()} />)

        expect(screen.getByText('WEB Tests was skipped')).toBeInTheDocument()
        expect(
            screen.getByText('API Tests failed and the pipeline is set to stop on failure')
        ).toBeInTheDocument()
    })

    it('pluralizes the title when more than one step was skipped', () => {
        const pipeline = makePipeline({
            steps: [
                {
                    project: 'API_Tests',
                    displayName: 'API Tests',
                    stopOnFailure: true,
                    status: 'failed',
                },
                {
                    project: 'WEB_Tests',
                    displayName: 'WEB Tests',
                    stopOnFailure: false,
                    status: 'skipped',
                },
                {
                    project: 'Staging',
                    displayName: 'Staging',
                    stopOnFailure: false,
                    status: 'skipped',
                },
            ],
        })

        render(<PipelineSkippedBanner pipeline={pipeline} onViewProject={vi.fn()} />)

        expect(screen.getByText('2 pipeline steps were skipped')).toBeInTheDocument()
    })

    it('calls onViewProject with the failed step project when the action is clicked', () => {
        const onViewProject = vi.fn()
        render(<PipelineSkippedBanner pipeline={makePipeline()} onViewProject={onViewProject} />)

        fireEvent.click(screen.getByRole('button', {name: 'View API Tests results'}))
        expect(onViewProject).toHaveBeenCalledWith('API_Tests')
    })

    it('hides the banner after dismiss for the same pipeline run', () => {
        const pipeline = makePipeline()
        render(<PipelineSkippedBanner pipeline={pipeline} onViewProject={vi.fn()} />)

        fireEvent.click(screen.getByRole('button', {name: 'Dismiss'}))

        expect(screen.queryByText('WEB Tests was skipped')).not.toBeInTheDocument()
    })

    it('shows the banner again for a new pipeline run after a previous one was dismissed', () => {
        const first = makePipeline({pipelineRunId: 'run-1'})
        const {rerender} = render(
            <PipelineSkippedBanner pipeline={first} onViewProject={vi.fn()} />
        )
        fireEvent.click(screen.getByRole('button', {name: 'Dismiss'}))
        expect(screen.queryByText('WEB Tests was skipped')).not.toBeInTheDocument()

        const second = makePipeline({pipelineRunId: 'run-2'})
        rerender(<PipelineSkippedBanner pipeline={second} onViewProject={vi.fn()} />)

        expect(screen.getByText('WEB Tests was skipped')).toBeInTheDocument()
    })
})

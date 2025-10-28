/**
 * Tests for ProgressBar Component
 *
 * Atomic UI component for displaying progress as a visual bar with percentage.
 *
 * Test Coverage:
 * - Rendering with different percentages
 * - Variant styles (primary, success, danger)
 * - Height variations (sm, md, lg)
 * - Label display toggle
 * - Percentage boundary handling (0-100)
 * - Dark mode support
 * - Accessibility (ARIA attributes)
 *
 * Target Coverage: 100%
 */

import {describe, it, expect} from 'vitest'
import {render, screen} from '@testing-library/react'
import {ProgressBar} from '../ProgressBar'

describe('ProgressBar', () => {
    describe('Rendering', () => {
        it('should render with default props', () => {
            const {container} = render(<ProgressBar percentage={50} />)

            const progressBar = container.querySelector('[role="progressbar"]')
            expect(progressBar).toBeInTheDocument()
            expect(progressBar).toHaveAttribute('aria-valuenow', '50')
            expect(progressBar).toHaveAttribute('aria-valuemin', '0')
            expect(progressBar).toHaveAttribute('aria-valuemax', '100')
        })

        it('should display percentage label by default', () => {
            render(<ProgressBar percentage={75} />)

            expect(screen.getByText('75%')).toBeInTheDocument()
        })

        it('should hide label when showLabel is false', () => {
            render(<ProgressBar percentage={75} showLabel={false} />)

            expect(screen.queryByText('75%')).not.toBeInTheDocument()
        })

        it('should render with correct width based on percentage', () => {
            const {container} = render(<ProgressBar percentage={60} />)

            const progressBar = container.querySelector('[role="progressbar"]')
            expect(progressBar).toHaveStyle({width: '60%'})
        })
    })

    describe('Percentage Handling', () => {
        it('should handle 0 percentage', () => {
            const {container} = render(<ProgressBar percentage={0} />)

            const progressBar = container.querySelector('[role="progressbar"]')
            expect(progressBar).toHaveStyle({width: '0%'})
            expect(screen.getByText('0%')).toBeInTheDocument()
        })

        it('should handle 100 percentage', () => {
            const {container} = render(<ProgressBar percentage={100} />)

            const progressBar = container.querySelector('[role="progressbar"]')
            expect(progressBar).toHaveStyle({width: '100%'})
            expect(screen.getByText('100%')).toBeInTheDocument()
        })

        it('should clamp negative percentage to 0', () => {
            const {container} = render(<ProgressBar percentage={-10} />)

            const progressBar = container.querySelector('[role="progressbar"]')
            expect(progressBar).toHaveStyle({width: '0%'})
            expect(screen.getByText('0%')).toBeInTheDocument()
        })

        it('should clamp percentage over 100 to 100', () => {
            const {container} = render(<ProgressBar percentage={150} />)

            const progressBar = container.querySelector('[role="progressbar"]')
            expect(progressBar).toHaveStyle({width: '100%'})
            expect(screen.getByText('100%')).toBeInTheDocument()
        })

        it('should handle decimal percentages', () => {
            render(<ProgressBar percentage={45.678} />)

            expect(screen.getByText('46%')).toBeInTheDocument()
        })
    })

    describe('Variants', () => {
        it('should apply primary variant class', () => {
            const {container} = render(<ProgressBar percentage={50} variant="primary" />)

            const progressBar = container.querySelector('[role="progressbar"]')
            expect(progressBar).toHaveClass('bg-primary-600')
        })

        it('should apply success variant class', () => {
            const {container} = render(<ProgressBar percentage={50} variant="success" />)

            const progressBar = container.querySelector('[role="progressbar"]')
            expect(progressBar).toHaveClass('bg-success-600')
        })

        it('should apply danger variant class', () => {
            const {container} = render(<ProgressBar percentage={50} variant="danger" />)

            const progressBar = container.querySelector('[role="progressbar"]')
            expect(progressBar).toHaveClass('bg-danger-600')
        })
    })

    describe('Height Variations', () => {
        it('should apply small height', () => {
            const {container} = render(<ProgressBar percentage={50} height="sm" />)

            const progressBar = container.querySelector('[role="progressbar"]')
            expect(progressBar).toHaveClass('h-1')
        })

        it('should apply medium height by default', () => {
            const {container} = render(<ProgressBar percentage={50} />)

            const progressBar = container.querySelector('[role="progressbar"]')
            expect(progressBar).toHaveClass('h-2')
        })

        it('should apply large height', () => {
            const {container} = render(<ProgressBar percentage={50} height="lg" />)

            const progressBar = container.querySelector('[role="progressbar"]')
            expect(progressBar).toHaveClass('h-4')
        })
    })

    describe('Custom Class Name', () => {
        it('should apply custom className', () => {
            const {container} = render(<ProgressBar percentage={50} className="custom-class" />)

            const wrapper = container.firstChild
            expect(wrapper).toHaveClass('custom-class')
        })
    })

    describe('Accessibility', () => {
        it('should have proper ARIA attributes', () => {
            const {container} = render(<ProgressBar percentage={65} />)

            const progressBar = container.querySelector('[role="progressbar"]')
            expect(progressBar).toHaveAttribute('role', 'progressbar')
            expect(progressBar).toHaveAttribute('aria-valuenow', '65')
            expect(progressBar).toHaveAttribute('aria-valuemin', '0')
            expect(progressBar).toHaveAttribute('aria-valuemax', '100')
        })

        it('should update ARIA valuenow when percentage changes', () => {
            const {container, rerender} = render(<ProgressBar percentage={30} />)

            let progressBar = container.querySelector('[role="progressbar"]')
            expect(progressBar).toHaveAttribute('aria-valuenow', '30')

            rerender(<ProgressBar percentage={80} />)

            progressBar = container.querySelector('[role="progressbar"]')
            expect(progressBar).toHaveAttribute('aria-valuenow', '80')
        })
    })

    describe('Visual Transitions', () => {
        it('should have transition classes for smooth animation', () => {
            const {container} = render(<ProgressBar percentage={50} />)

            const progressBar = container.querySelector('[role="progressbar"]')
            expect(progressBar).toHaveClass('transition-all')
            expect(progressBar).toHaveClass('duration-300')
            expect(progressBar).toHaveClass('ease-out')
        })
    })

    describe('Dark Mode', () => {
        it('should have dark mode classes for primary variant', () => {
            const {container} = render(<ProgressBar percentage={50} variant="primary" />)

            const progressBar = container.querySelector('[role="progressbar"]')
            expect(progressBar).toHaveClass('dark:bg-primary-500')
        })

        it('should have dark mode classes for success variant', () => {
            const {container} = render(<ProgressBar percentage={50} variant="success" />)

            const progressBar = container.querySelector('[role="progressbar"]')
            expect(progressBar).toHaveClass('dark:bg-success-500')
        })

        it('should have dark mode classes for label text', () => {
            const {container} = render(<ProgressBar percentage={50} />)

            const label = container.querySelector('.text-gray-500')
            expect(label).toHaveClass('dark:text-gray-400')
        })
    })
})

import {describe, expect, it, vi} from 'vitest'
import {render, screen} from '@testing-library/react'
import {TestConsoleOutput} from '../TestConsoleTab'
import {TestResult} from '@yshvydak/core'

describe('TestConsoleTab', () => {
    it('renders empty state when no entries', () => {
        const test = {
            id: '1',
            testId: 't1',
            name: 'Test',
            filePath: 'a.spec.ts',
            status: 'passed',
            duration: 10,
            runId: 'run1',
        } satisfies TestResult

        render(<TestConsoleOutput test={test} />)
        expect(screen.getByText(/No console output captured/i)).toBeInTheDocument()
    })

    it('renders stdout/stderr entries and allows copy', () => {
        const writeText = vi.fn()
        Object.assign(navigator, {clipboard: {writeText}})

        const test = {
            id: '1',
            testId: 't1',
            name: 'Test',
            filePath: 'a.spec.ts',
            status: 'passed',
            duration: 10,
            runId: 'run1',
            metadata: {
                console: {
                    entries: [
                        {type: 'stdout', text: 'hello\n', timestamp: new Date().toISOString()},
                        {type: 'stderr', text: 'oops\n', timestamp: new Date().toISOString()},
                    ],
                },
            },
        } satisfies TestResult

        render(<TestConsoleOutput test={test} />)

        expect(screen.getByText('stdout')).toBeInTheDocument()
        expect(screen.getByText('stderr')).toBeInTheDocument()
        expect(screen.getByText(/hello/i)).toBeInTheDocument()
        expect(screen.getByText(/oops/i)).toBeInTheDocument()

        screen.getByRole('button', {name: /copy/i}).click()
        expect(writeText).toHaveBeenCalledWith('hello\noops\n')
    })
})

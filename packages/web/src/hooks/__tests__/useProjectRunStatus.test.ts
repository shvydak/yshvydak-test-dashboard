import {describe, it, expect} from 'vitest'
import {act, renderHook} from '@testing-library/react'
import {useProjectRunStatus} from '../useProjectRunStatus'

describe('useProjectRunStatus', () => {
    it('starts with an empty set', () => {
        const {result} = renderHook(() => useProjectRunStatus())
        expect(result.current.runningProjects.size).toBe(0)
    })

    it('adds a project immediately on process:started', () => {
        const {result} = renderHook(() => useProjectRunStatus())

        act(() => {
            result.current.applyRunStatusEvent('process:started', {
                runId: 'run-1',
                type: 'run-all',
                project: 'API_Tests',
            })
        })

        expect(result.current.runningProjects.has('API_Tests')).toBe(true)
    })

    it('ignores process:started with no project', () => {
        const {result} = renderHook(() => useProjectRunStatus())

        act(() => {
            result.current.applyRunStatusEvent('process:started', {runId: 'run-1', type: 'rerun'})
        })

        expect(result.current.runningProjects.size).toBe(0)
    })

    it('replaces the whole set from connection:status (canonical snapshot)', () => {
        const {result} = renderHook(() => useProjectRunStatus())

        act(() => {
            result.current.applyRunStatusEvent('process:started', {
                runId: 'run-1',
                type: 'run-all',
                project: 'API_Tests',
            })
        })
        expect(result.current.runningProjects.has('API_Tests')).toBe(true)

        act(() => {
            result.current.applyRunStatusEvent('connection:status', {
                activeRuns: [{id: 'run-2', type: 'run-group', details: {project: 'All_Tests'}}],
                activeGroups: [],
                isAnyProcessRunning: true,
            })
        })

        // API_Tests' run finished in the meantime — connection:status is authoritative
        expect(result.current.runningProjects.has('API_Tests')).toBe(false)
        expect(result.current.runningProjects.has('All_Tests')).toBe(true)
    })

    it('clears the set when connection:status reports no active runs', () => {
        const {result} = renderHook(() => useProjectRunStatus())

        act(() => {
            result.current.applyRunStatusEvent('process:started', {
                runId: 'run-1',
                type: 'run-all',
                project: 'API_Tests',
            })
        })

        act(() => {
            result.current.applyRunStatusEvent('connection:status', {
                activeRuns: [],
                activeGroups: [],
                isAnyProcessRunning: false,
            })
        })

        expect(result.current.runningProjects.size).toBe(0)
    })

    it('supports multiple simultaneously-tracked projects from connection:status', () => {
        const {result} = renderHook(() => useProjectRunStatus())

        act(() => {
            result.current.applyRunStatusEvent('connection:status', {
                activeRuns: [
                    {id: 'run-1', type: 'run-all', details: {project: 'API_Tests'}},
                    {id: 'run-2', type: 'run-group', details: {project: 'All_Tests'}},
                ],
                activeGroups: [],
                isAnyProcessRunning: true,
            })
        })

        expect(result.current.runningProjects.has('API_Tests')).toBe(true)
        expect(result.current.runningProjects.has('All_Tests')).toBe(true)
        expect(result.current.runningProjects.size).toBe(2)
    })

    it('ignores unrelated message types', () => {
        const {result} = renderHook(() => useProjectRunStatus())

        act(() => {
            result.current.applyRunStatusEvent('process:ended', {
                runId: 'run-1',
                status: 'completed',
            })
        })

        expect(result.current.runningProjects.size).toBe(0)
    })
})

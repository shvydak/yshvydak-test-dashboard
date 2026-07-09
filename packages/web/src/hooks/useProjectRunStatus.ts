import {useCallback, useState} from 'react'

export interface UseProjectRunStatusReturn {
    runningProjects: Set<string>
    applyRunStatusEvent: (type: string, data: any) => void
}

/**
 * Tracks which project(s) currently have an active test run — regardless of
 * trigger (manual Run All, group run, single-test rerun, or a CI-pipeline step).
 * Fed by the existing `connection:status` (canonical snapshot) and `process:started`
 * (instant feedback) WebSocket messages, both of which now carry `details.project`
 * / `project` on the active process.
 */
export function useProjectRunStatus(): UseProjectRunStatusReturn {
    const [runningProjects, setRunningProjects] = useState<Set<string>>(new Set())

    const applyRunStatusEvent = useCallback((type: string, data: any) => {
        switch (type) {
            case 'connection:status': {
                const activeRuns: any[] = data?.activeRuns ?? []
                const projects = activeRuns
                    .map((run) => run?.details?.project)
                    .filter((project): project is string => Boolean(project))
                setRunningProjects(new Set(projects))
                break
            }

            case 'process:started': {
                const project = data?.project
                if (project) {
                    setRunningProjects((prev) => {
                        const next = new Set(prev)
                        next.add(project)
                        return next
                    })
                }
                break
            }

            default:
            // `process:ended` doesn't carry project — the server always follows it
            // with a `connection:status` broadcast, which resyncs the set above.
        }
    }, [])

    return {runningProjects, applyRunStatusEvent}
}

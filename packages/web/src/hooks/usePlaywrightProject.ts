import {useState, useEffect, useCallback} from 'react'
import {authGet} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'

const STORAGE_KEY = 'playwright_project'
const ALL_PROJECTS_VALUE = ''

export interface UsePlaywrightProjectReturn {
    selectedProject: string
    setSelectedProject: (project: string) => void
    availableProjects: string[]
    isLoadingProjects: boolean
    reloadProjects: () => Promise<void>
}

export function usePlaywrightProject(): UsePlaywrightProjectReturn {
    const [selectedProject, setSelectedProjectState] = useState<string>(() =>
        getProjectFromStorage()
    )
    const [availableProjects, setAvailableProjects] = useState<string[]>([])
    const [isLoadingProjects, setIsLoadingProjects] = useState(false)

    const setSelectedProject = (project: string) => {
        setSelectedProjectState(project)
        localStorage.setItem(STORAGE_KEY, project)
    }

    const reloadProjects = useCallback(async () => {
        setIsLoadingProjects(true)
        try {
            const response = await authGet(`${config.api.baseUrl}/tests/projects`)
            if (response.ok) {
                const data = await response.json()
                const projects: string[] = data.data ?? data ?? []
                setAvailableProjects(projects)

                // If saved project no longer exists, reset to "all"
                const saved = getProjectFromStorage()
                if (saved && !projects.includes(saved)) {
                    setSelectedProject(ALL_PROJECTS_VALUE)
                }
            }
        } catch {
            setAvailableProjects([])
        } finally {
            setIsLoadingProjects(false)
        }
    }, [])

    useEffect(() => {
        reloadProjects()
    }, [reloadProjects])

    return {
        selectedProject,
        setSelectedProject,
        availableProjects,
        isLoadingProjects,
        reloadProjects,
    }
}

export function getProjectFromStorage(): string {
    return localStorage.getItem(STORAGE_KEY) ?? ALL_PROJECTS_VALUE
}

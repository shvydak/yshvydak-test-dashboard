import {useState, useEffect, useCallback} from 'react'
import {authGet, authPut} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'

const ALL_PROJECTS_VALUE = ''

export interface UsePlaywrightProjectReturn {
    selectedProject: string
    setSelectedProject: (project: string) => Promise<void>
    availableProjects: string[]
    isLoadingProjects: boolean
    isSavingProject: boolean
    projectError: string | null
    reloadProjects: () => Promise<void>
}

export function usePlaywrightProject(): UsePlaywrightProjectReturn {
    const [selectedProject, setSelectedProjectState] = useState<string>(ALL_PROJECTS_VALUE)
    const [availableProjects, setAvailableProjects] = useState<string[]>([])
    const [isLoadingProjects, setIsLoadingProjects] = useState(false)
    const [isSavingProject, setIsSavingProject] = useState(false)
    const [projectError, setProjectError] = useState<string | null>(null)

    const setSelectedProject = async (project: string) => {
        const previousProject = selectedProject
        setSelectedProjectState(project)
        setProjectError(null)
        setIsSavingProject(true)

        try {
            const response = await authPut(
                `${config.api.baseUrl}/settings/test-execution/project`,
                {
                    project,
                }
            )

            if (!response.ok) {
                const errorData = await response.json().catch(() => null)
                throw new Error(errorData?.message || 'Failed to save Playwright project')
            }

            const data = await response.json()
            setSelectedProjectState(data.data?.project ?? ALL_PROJECTS_VALUE)
        } catch (error) {
            setSelectedProjectState(previousProject)
            setProjectError(
                error instanceof Error ? error.message : 'Failed to save Playwright project'
            )
        } finally {
            setIsSavingProject(false)
        }
    }

    const reloadProjects = useCallback(async () => {
        setIsLoadingProjects(true)
        setProjectError(null)

        try {
            const [projectsResponse, settingsResponse] = await Promise.all([
                authGet(`${config.api.baseUrl}/tests/projects`),
                authGet(`${config.api.baseUrl}/settings/test-execution`),
            ])

            if (!projectsResponse.ok) {
                throw new Error('Failed to load available Playwright projects')
            }

            if (!settingsResponse.ok) {
                throw new Error('Failed to load Playwright project setting')
            }

            const projectsData = await projectsResponse.json()
            const settingsData = await settingsResponse.json()
            const projects: string[] = projectsData.data ?? projectsData ?? []

            setAvailableProjects(projects)
            setSelectedProjectState(settingsData.data?.project ?? ALL_PROJECTS_VALUE)
        } catch (error) {
            setAvailableProjects([])
            setSelectedProjectState(ALL_PROJECTS_VALUE)
            setProjectError(
                error instanceof Error ? error.message : 'Failed to load Playwright project'
            )
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
        isSavingProject,
        projectError,
        reloadProjects,
    }
}

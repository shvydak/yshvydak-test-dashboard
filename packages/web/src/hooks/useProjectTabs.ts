import {useState, useEffect, useCallback} from 'react'
import {authGet, authPut} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'

export interface ProjectTabConfig {
    project: string
    displayName: string
    visible: boolean
    inPipeline: boolean
    stopPipelineOnFailure: boolean
}

export interface UseProjectTabsReturn {
    tabs: ProjectTabConfig[]
    visibleTabs: ProjectTabConfig[]
    updateTabs: (configs: ProjectTabConfig[]) => Promise<void>
    isLoading: boolean
    isSaving: boolean
    error: string | null
    reload: () => Promise<void>
}

export function useProjectTabs(isAuthenticated = true): UseProjectTabsReturn {
    const [tabs, setTabs] = useState<ProjectTabConfig[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setIsLoading(true)
        setError(null)

        try {
            const [tabsRes, projectsRes] = await Promise.all([
                authGet(`${config.api.baseUrl}/settings/project-tabs`),
                authGet(`${config.api.baseUrl}/tests/projects`),
            ])

            if (!tabsRes.ok || !projectsRes.ok) {
                throw new Error('Failed to load project tab settings')
            }

            const tabsData = await tabsRes.json()
            const projectsData = await projectsRes.json()

            const saved: ProjectTabConfig[] = tabsData.data ?? []
            const available: string[] = projectsData.data ?? projectsData ?? []

            // Merge: start from saved configs, add any new projects not yet configured
            const savedProjects = new Set(saved.map((c) => c.project))
            const merged: ProjectTabConfig[] = [...saved]

            for (const project of available) {
                if (!savedProjects.has(project)) {
                    merged.push({
                        project,
                        displayName: project,
                        visible: true,
                        inPipeline: false,
                        stopPipelineOnFailure: false,
                    })
                }
            }

            setTabs(merged)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load project tabs')
        } finally {
            setIsLoading(false)
        }
    }, [])

    const updateTabs = useCallback(async (configs: ProjectTabConfig[]) => {
        setIsSaving(true)
        setError(null)

        try {
            const res = await authPut(`${config.api.baseUrl}/settings/project-tabs`, {configs})

            if (!res.ok) {
                const data = await res.json().catch(() => null)
                throw new Error(data?.message || 'Failed to save project tab configs')
            }

            const data = await res.json()
            setTabs(data.data ?? configs)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save project tabs')
            throw err
        } finally {
            setIsSaving(false)
        }
    }, [])

    useEffect(() => {
        if (!isAuthenticated) return
        reload()
    }, [reload, isAuthenticated])

    const visibleTabs = tabs.filter((t) => t.visible)

    return {tabs, visibleTabs, updateTabs, isLoading, isSaving, error, reload}
}

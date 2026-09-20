import {useState, useEffect, useCallback, useMemo} from 'react'
import {authGet, authPut} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'
import {CIPipelineName, normalizeCIPipelines} from '@/constants/ciPipelines'

export interface ProjectTabConfig {
    project: string
    displayName: string
    visible: boolean
    pipelines: CIPipelineName[]
    stopPipelineOnFailure: boolean
    workers?: number
}

// Module-level cache mirrors the last-loaded tab configs so non-React code
// (testsStore) can resolve a project's workers override without a hook.
let projectTabsCache: ProjectTabConfig[] = []

export function getProjectWorkersOverride(project?: string): number | undefined {
    if (!project) return undefined
    return projectTabsCache.find((t) => t.project === project)?.workers
}

/**
 * Pick which project tab to auto-select when the URL has no `?project=`.
 * Configured default wins when that tab is visible; otherwise a sole visible
 * tab is selected. Returns null when the user should stay on the unscoped view.
 */
export function resolveDefaultProjectTab(
    visibleTabs: Pick<ProjectTabConfig, 'project'>[],
    configuredDefault: string
): string | null {
    const trimmed = configuredDefault.trim()
    if (trimmed && visibleTabs.some((t) => t.project === trimmed)) {
        return trimmed
    }
    if (visibleTabs.length === 1) {
        return visibleTabs[0].project
    }
    return null
}

export interface UseProjectTabsReturn {
    tabs: ProjectTabConfig[]
    visibleTabs: ProjectTabConfig[]
    /**
     * Saved tabs whose project is no longer in the live Playwright project list
     * (GET /tests/projects = playwright config). Empty while that list is empty:
     * the server swallows list errors as [], so "nothing live" can't be told from "failed".
     */
    staleProjects: string[]
    defaultProjectTab: string
    updateTabs: (configs: ProjectTabConfig[]) => Promise<void>
    setDefaultProjectTab: (project: string) => Promise<void>
    isLoading: boolean
    isSaving: boolean
    error: string | null
    reload: () => Promise<void>
}

export function useProjectTabs(isAuthenticated = true): UseProjectTabsReturn {
    const [tabs, setTabs] = useState<ProjectTabConfig[]>([])
    const [availableProjects, setAvailableProjects] = useState<string[]>([])
    const [defaultProjectTab, setDefaultProjectTabState] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setIsLoading(true)
        setError(null)

        try {
            const [tabsRes, projectsRes, defaultRes] = await Promise.all([
                authGet(`${config.api.baseUrl}/settings/project-tabs`),
                authGet(`${config.api.baseUrl}/tests/projects`),
                authGet(`${config.api.baseUrl}/settings/default-project-tab`),
            ])

            if (!tabsRes.ok || !projectsRes.ok) {
                throw new Error('Failed to load project tab settings')
            }

            const tabsData = await tabsRes.json()
            const projectsData = await projectsRes.json()

            const savedRaw: Array<ProjectTabConfig & {inPipeline?: unknown}> = tabsData.data ?? []
            const available: string[] = projectsData.data ?? projectsData ?? []

            const saved: ProjectTabConfig[] = savedRaw.map((c) => ({
                ...c,
                pipelines: normalizeCIPipelines(c.pipelines, c.inPipeline),
            }))
            const savedProjects = new Set(saved.map((c) => c.project))
            const merged: ProjectTabConfig[] = [...saved]

            for (const project of available) {
                if (!savedProjects.has(project)) {
                    merged.push({
                        project,
                        displayName: project,
                        visible: true,
                        pipelines: [],
                        stopPipelineOnFailure: false,
                    })
                }
            }

            projectTabsCache = merged
            setTabs(merged)
            setAvailableProjects(available)

            // Soft-fail: tabs still work if the default-tab endpoint is unavailable
            if (defaultRes.ok) {
                const defaultData = await defaultRes.json()
                setDefaultProjectTabState(defaultData.data?.project ?? '')
            } else {
                setDefaultProjectTabState('')
            }
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
            projectTabsCache = data.data ?? configs
            setTabs(projectTabsCache)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save project tabs')
            throw err
        } finally {
            setIsSaving(false)
        }
    }, [])

    const setDefaultProjectTab = useCallback(
        async (project: string) => {
            const previous = defaultProjectTab
            setDefaultProjectTabState(project)
            setIsSaving(true)
            setError(null)

            try {
                const res = await authPut(`${config.api.baseUrl}/settings/default-project-tab`, {
                    project,
                })

                if (!res.ok) {
                    const data = await res.json().catch(() => null)
                    throw new Error(data?.message || 'Failed to save default project tab')
                }

                const data = await res.json()
                setDefaultProjectTabState(data.data?.project ?? '')
            } catch (err) {
                setDefaultProjectTabState(previous)
                setError(err instanceof Error ? err.message : 'Failed to save default project tab')
                throw err
            } finally {
                setIsSaving(false)
            }
        },
        [defaultProjectTab]
    )

    useEffect(() => {
        if (!isAuthenticated) return
        reload()
    }, [reload, isAuthenticated])

    const visibleTabs = tabs.filter((t) => t.visible)

    const staleProjects = useMemo(() => {
        if (availableProjects.length === 0) return []
        const live = new Set(availableProjects)
        return tabs.filter((t) => !live.has(t.project)).map((t) => t.project)
    }, [tabs, availableProjects])

    return {
        tabs,
        visibleTabs,
        staleProjects,
        defaultProjectTab,
        updateTabs,
        setDefaultProjectTab,
        isLoading,
        isSaving,
        error,
        reload,
    }
}

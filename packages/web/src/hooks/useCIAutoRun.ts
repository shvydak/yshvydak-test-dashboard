import {useState, useEffect, useCallback} from 'react'
import {authGet, authPut} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'

export interface CIAutoRunPause {
    paused: boolean
    resumeAt: string | null
}

export interface UseCIAutoRunReturn {
    pause: CIAutoRunPause | null
    isLoading: boolean
    isSaving: boolean
    pauseFor: (durationHours: number) => Promise<void>
    resume: () => Promise<void>
    reload: () => Promise<void>
}

export function useCIAutoRun(): UseCIAutoRunReturn {
    const [pause, setPause] = useState<CIAutoRunPause | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    const reload = useCallback(async () => {
        setIsLoading(true)
        try {
            const res = await authGet(`${config.api.baseUrl}/settings/ci-autorun-pause`)
            if (!res.ok) throw new Error('Failed to load CI auto-run pause state')
            const data = await res.json()
            const raw: CIAutoRunPause = data.data ?? data
            // Auto-resume client-side if time passed
            if (raw.paused && raw.resumeAt && new Date(raw.resumeAt) <= new Date()) {
                setPause({paused: false, resumeAt: null})
            } else {
                setPause(raw)
            }
        } catch {
            // silently fail — feature degrades gracefully
        } finally {
            setIsLoading(false)
        }
    }, [])

    const pauseFor = useCallback(async (durationHours: number) => {
        setIsSaving(true)
        try {
            const res = await authPut(`${config.api.baseUrl}/settings/ci-autorun-pause`, {
                paused: true,
                durationHours,
            })
            if (!res.ok) throw new Error('Failed to pause CI auto-run')
            const data = await res.json()
            setPause(data.data ?? data)
        } finally {
            setIsSaving(false)
        }
    }, [])

    const resume = useCallback(async () => {
        setIsSaving(true)
        try {
            const res = await authPut(`${config.api.baseUrl}/settings/ci-autorun-pause`, {
                paused: false,
            })
            if (!res.ok) throw new Error('Failed to resume CI auto-run')
            setPause({paused: false, resumeAt: null})
        } finally {
            setIsSaving(false)
        }
    }, [])

    useEffect(() => {
        reload()
    }, [reload])

    return {pause, isLoading, isSaving, pauseFor, resume, reload}
}

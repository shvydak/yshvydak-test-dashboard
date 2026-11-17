import {useEffect, useState} from 'react'
import {createProtectedFileURL} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'

export interface UseProtectedImageUrlReturn {
    url: string | null
    loading: boolean
    error: boolean
}

// Blob URL of a protected image; revoked when `path` changes, `enabled` turns off or the host unmounts.
export function useProtectedImageUrl(
    path: string | null,
    enabled: boolean = true
): UseProtectedImageUrlReturn {
    const [state, setState] = useState<UseProtectedImageUrlReturn>({
        url: null,
        loading: true,
        error: false,
    })

    useEffect(() => {
        if (!enabled || !path) {
            setState({url: null, loading: true, error: false})
            return
        }
        let cancelled = false
        // Local, not state: the cleanup must revoke what THIS run created
        let created: string | null = null
        setState({url: null, loading: true, error: false})

        createProtectedFileURL(path, config.api.serverUrl).then(
            (url) => {
                if (cancelled) {
                    URL.revokeObjectURL(url)
                    return
                }
                created = url
                setState({url, loading: false, error: false})
            },
            (err) => {
                console.error('Failed to load note image:', err)
                if (!cancelled) setState({url: null, loading: false, error: true})
            }
        )

        return () => {
            cancelled = true
            if (created) URL.revokeObjectURL(created)
        }
    }, [path, enabled])

    return state
}

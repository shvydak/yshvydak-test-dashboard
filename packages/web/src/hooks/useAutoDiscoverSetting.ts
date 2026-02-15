import {useState, useEffect} from 'react'

const STORAGE_KEY = 'autoDiscoverBeforeRun'

export function useAutoDiscoverSetting() {
    const [enabled, setEnabled] = useState<boolean>(() => getAutoDiscoverFromStorage())

    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved !== null) {
            setEnabled(saved === 'true')
        }
    }, [])

    const toggle = () => {
        const newValue = !enabled
        localStorage.setItem(STORAGE_KEY, String(newValue))
        setEnabled(newValue)
    }

    return {enabled, toggle}
}

export function getAutoDiscoverFromStorage(): boolean {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === null ? true : saved === 'true'
}

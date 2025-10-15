import {useState, useEffect} from 'react'

const STORAGE_KEY = 'playwright_workers'
const DEFAULT_WORKERS = 2
const MIN_WORKERS = 1
const MAX_WORKERS = 16

export interface UsePlaywrightWorkersReturn {
    workers: number
    setWorkers: (count: number) => void
    resetToDefault: () => void
    isValid: (count: number) => boolean
}

export function usePlaywrightWorkers(): UsePlaywrightWorkersReturn {
    const [workers, setWorkersState] = useState<number>(DEFAULT_WORKERS)

    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
            const parsed = parseInt(saved, 10)
            if (isValid(parsed)) {
                setWorkersState(parsed)
            }
        }
    }, [])

    const isValid = (count: number): boolean => {
        return Number.isInteger(count) && count >= MIN_WORKERS && count <= MAX_WORKERS
    }

    const setWorkers = (count: number) => {
        if (isValid(count)) {
            setWorkersState(count)
            localStorage.setItem(STORAGE_KEY, count.toString())
        }
    }

    const resetToDefault = () => {
        setWorkers(DEFAULT_WORKERS)
    }

    return {workers, setWorkers, resetToDefault, isValid}
}

export function getMaxWorkersFromStorage(): number {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? parseInt(saved, 10) : DEFAULT_WORKERS
}

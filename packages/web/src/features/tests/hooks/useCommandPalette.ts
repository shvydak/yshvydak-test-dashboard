import {useCallback, useEffect, useState} from 'react'

/** Open state of the test search palette; Cmd+K / Ctrl+K toggles it while enabled. */
export function useCommandPalette(enabled: boolean) {
    const [isOpen, setIsOpen] = useState(false)
    const open = useCallback(() => setIsOpen(true), [])
    const close = useCallback(() => setIsOpen(false), [])

    useEffect(() => {
        if (!enabled) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setIsOpen((current) => !current)
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [enabled])

    return {isOpen, open, close}
}

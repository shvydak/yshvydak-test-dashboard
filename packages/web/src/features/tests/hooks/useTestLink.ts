import {useEffect, useRef} from 'react'
import {TestResult} from '@yshvydak/core'
import {testLinkService} from '@/services/testLink.service'

export type TestLinkFailure = 'not-found' | 'error'

interface UseTestLinkOptions {
    testId: string | null
    // Hold off while the caller's list is still loading.
    wait?: boolean
    // A test already in the caller's list opens without a request.
    findLocal?: (testId: string) => TestResult | undefined
    onResolved: (test: TestResult) => void
    onFailed: (reason: TestLinkFailure) => void
}

/**
 * Resolves a shared `?testId=` link: the caller's list first, then the server (any project).
 * Each new testId is handled once, so a change from one test to another also resolves.
 * Results arriving after unmount, or after the URL moved on (another testId, or cleared), are dropped.
 * Callbacks are read at apply time, so they see the URL as it is then, not as it was at the start.
 */
export function useTestLink(options: UseTestLinkOptions) {
    const {testId, wait = false} = options
    const optionsRef = useRef(options)
    optionsRef.current = options
    const handledRef = useRef<string | null>(null)
    const mountedRef = useRef(false)
    // Bumped on every new link, local hit or cleared link: an older lookup is then ignored
    const requestRef = useRef(0)

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
        }
    }, [])

    useEffect(() => {
        if (!testId) {
            handledRef.current = null
            requestRef.current++
            return
        }
        if (handledRef.current === testId) return
        if (wait) {
            // A running lookup is for an older link now
            requestRef.current++
            return
        }
        handledRef.current = testId
        const request = ++requestRef.current

        const local = optionsRef.current.findLocal?.(testId)
        if (local) {
            optionsRef.current.onResolved(local)
            return
        }

        const isCurrent = () => mountedRef.current && request === requestRef.current

        testLinkService
            .getLatestByTestId(testId)
            .then((test) => {
                if (!isCurrent()) return
                if (test) optionsRef.current.onResolved(test)
                else optionsRef.current.onFailed('not-found')
            })
            .catch(() => {
                if (isCurrent()) optionsRef.current.onFailed('error')
            })
    }, [testId, wait])
}

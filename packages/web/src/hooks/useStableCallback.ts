import {useCallback, useRef} from 'react'

/** A function with a fixed identity that always runs the latest `fn`: lets memoized children skip re-renders. */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R) {
    const ref = useRef(fn)
    ref.current = fn
    return useCallback((...args: A) => ref.current(...args), [])
}

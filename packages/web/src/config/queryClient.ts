import {QueryClient} from '@tanstack/react-query'

// Shared singleton so code outside the React tree (e.g. the Zustand testsStore)
// can invalidate react-query caches too — see fetchTests() in testsStore.ts.
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: false,
            refetchOnWindowFocus: false,
        },
    },
})

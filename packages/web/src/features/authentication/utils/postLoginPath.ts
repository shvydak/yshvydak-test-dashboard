// Where to go after sign-in: the page the user was on, if it is a same-origin relative path.
export function getPostLoginPath(location: Pick<Location, 'pathname' | 'search' | 'hash'>): string {
    const path = `${location.pathname}${location.search}${location.hash}`
    return isSafeRelativePath(path) && location.pathname !== '/login' ? path : '/'
}

function isSafeRelativePath(path: string): boolean {
    // `//host` and `/\host` are protocol-relative; control characters can smuggle a scheme past the check
    if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return false
    if (/[\u0000-\u001f\\]/.test(path)) return false
    try {
        return new URL(path, 'http://localhost').origin === 'http://localhost'
    } catch {
        return false
    }
}

// A 401 in authFetch logs out through the function App registers here
let globalLogoutFunction: (() => void) | null = null

export function setGlobalLogout(logout: () => void) {
    globalLogoutFunction = logout
}

export function getGlobalLogout(): (() => void) | null {
    return globalLogoutFunction
}

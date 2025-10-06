import React, {createContext, useContext, ReactNode} from 'react'

interface AuthContextType {
    logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
    children: ReactNode
    onLogout: () => void
}

export function AuthProvider({children, onLogout}: AuthProviderProps) {
    const logout = () => {
        localStorage.removeItem('_auth')
        sessionStorage.removeItem('_auth')

        onLogout()
    }

    return <AuthContext.Provider value={{logout}}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext)
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider')
    }
    return context
}

let globalLogoutFunction: (() => void) | null = null

export function setGlobalLogout(logout: () => void) {
    globalLogoutFunction = logout
}

export function getGlobalLogout(): (() => void) | null {
    return globalLogoutFunction
}

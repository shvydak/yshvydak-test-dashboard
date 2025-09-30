import React from 'react'

interface AuthProviderWrapperProps {
  children: React.ReactNode
}

export function AuthProviderWrapper({ children }: AuthProviderWrapperProps) {
  return <div>{children}</div>
}
import React from 'react'

interface AuthProviderWrapperProps {
  children: React.ReactNode
}

export function AuthProviderWrapper({ children }: AuthProviderWrapperProps) {
  console.log('🔧 AuthProviderWrapper rendering...')
  return <div>{children}</div>
}
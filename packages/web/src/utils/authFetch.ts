/**
 * Authenticated fetch utility that automatically includes JWT tokens
 */

// Get JWT token from storage (React Auth Kit storage)
function getAuthToken(): string | null {
  try {
    // React Auth Kit stores token with _auth key in localStorage
    const authData = localStorage.getItem('_auth') || sessionStorage.getItem('_auth')

    console.debug('🔍 Auth data from storage:', authData ? 'Found' : 'Not found')

    if (!authData) {
      return null
    }

    // React Auth Kit stores the token in JSON format: {"auth":{"token":"...", "type":"Bearer"}}
    const parsedAuth = JSON.parse(authData)
    console.debug('🔍 Parsed auth data:', parsedAuth)

    // Check different possible structures
    if (parsedAuth?.auth?.token) {
      console.debug('✅ Found token in auth.token format')
      return parsedAuth.auth.token
    }

    if (parsedAuth?.token) {
      console.debug('✅ Found token in direct token format')
      return parsedAuth.token
    }

    // If it's just a string token
    if (typeof parsedAuth === 'string') {
      console.debug('✅ Found plain string token')
      return parsedAuth
    }

    console.warn('⚠️ Token found but in unexpected format:', parsedAuth)
    return null

  } catch (error) {
    console.error('❌ Error parsing auth token from storage:', error)
    return null
  }
}

// Create headers with authentication
function createAuthHeaders(additionalHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...additionalHeaders
  }

  const token = getAuthToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return headers
}

// Authenticated fetch wrapper
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = createAuthHeaders(options.headers as Record<string, string>)

  const response = await fetch(url, {
    ...options,
    headers
  })

  // Handle authentication errors
  if (response.status === 401) {
    console.warn('🚨 Authentication failed (401), clearing auth data')
    // Token might be expired or invalid
    // Clear auth data and redirect to login
    localStorage.removeItem('_auth')
    sessionStorage.removeItem('_auth')

    // For React Router, we should navigate programmatically rather than using window.location
    // This will be handled by the calling component
    throw new Error('Authentication required')
  }

  return response
}

// Convenience methods
export const authGet = (url: string, options: RequestInit = {}) =>
  authFetch(url, { ...options, method: 'GET' })

export const authPost = (url: string, data?: any, options: RequestInit = {}) =>
  authFetch(url, {
    ...options,
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined
  })

export const authPut = (url: string, data?: any, options: RequestInit = {}) =>
  authFetch(url, {
    ...options,
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined
  })

export const authDelete = (url: string, options: RequestInit = {}) =>
  authFetch(url, { ...options, method: 'DELETE' })

// Hook-compatible versions for React components
export function useAuthFetch() {
  return {
    authFetch,
    authGet,
    authPost,
    authPut,
    authDelete,
    getAuthToken,
    createAuthHeaders
  }
}
/**
 * Authenticated fetch utility that automatically includes JWT tokens
 */

// Get JWT token from storage (React Auth Kit storage)
function getAuthToken(): string | null {
  try {
    const authData = localStorage.getItem('_auth') || sessionStorage.getItem('_auth')

    if (!authData) {
      return null
    }

    const parsedAuth = JSON.parse(authData)

    // Check different possible structures
    if (parsedAuth?.auth?.token) {
      return parsedAuth.auth.token
    }

    if (parsedAuth?.token) {
      return parsedAuth.token
    }

    // If it's just a string token
    if (typeof parsedAuth === 'string') {
      return parsedAuth
    }

    return null

  } catch (error) {
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

// Download protected file and return blob URL
export async function downloadProtectedFile(url: string): Promise<string> {
  const response = await authFetch(url)

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`)
  }

  const blob = await response.blob()
  return URL.createObjectURL(blob)
}

// Create blob URL for protected static file
export async function createProtectedFileURL(relativePath: string, baseUrl: string): Promise<string> {
  const fullUrl = `${baseUrl}/${relativePath}`
  return downloadProtectedFile(fullUrl)
}

// Hook-compatible versions for React components
export function useAuthFetch() {
  return {
    authFetch,
    authGet,
    authPost,
    authPut,
    authDelete,
    getAuthToken,
    createAuthHeaders,
    downloadProtectedFile,
    createProtectedFileURL
  }
}
# Authentication Implementation

## Overview

The YShvydak Test Dashboard implements a simplified JWT-based authentication system that protects the web interface while keeping API endpoints open for reporter integration. This provides security for users while maintaining simplicity for test execution.

## Architecture

### Authentication Strategy: Simplified Single-Layer

The system implements **JWT authentication for web users only**:

1. **JWT Authentication** - For user browser sessions and web interface
2. **Open API** - Reporter endpoints are publicly accessible in local network

This approach prioritizes simplicity and ease of configuration while maintaining security for the web dashboard.

### Technology Stack

- **Backend JWT**: `fast-jwt` - High-performance JWT library for Node.js
- **Frontend Auth**: Custom localStorage-based authentication (production-ready and optimized)
- **Storage**: Environment variables for user credentials
- **Architecture**: Integrated with existing layered architecture pattern

## Security Model

### User Authentication Flow

```
1. User visits dashboard → Redirect to login page
2. User submits credentials → Server validates against .env
3. Server generates JWT token → Client stores token
4. Client accesses protected web UI and static files with JWT
5. WebSocket connection includes JWT via query params
```

### Reporter Integration Flow

```
1. Reporter starts → Connects directly to API endpoints
2. Reporter sends test data → No authentication required
3. Server accepts all reporter data → Stores in database
4. Dashboard users view data → Protected by JWT authentication
```

### Token Expiry Handling

The system implements **automatic logout on token expiry** to ensure security and proper user experience:

#### Components

1. **AuthContext** ([packages/web/src/features/authentication/context/AuthContext.tsx](../../packages/web/src/features/authentication/context/AuthContext.tsx))
   - Global logout function accessible throughout the application
   - Centralized authentication state management
   - Clean separation between auth logic and UI components

2. **Token Validator** ([packages/web/src/features/authentication/utils/tokenValidator.ts](../../packages/web/src/features/authentication/utils/tokenValidator.ts))
   - `verifyToken()`: Validates token via `/api/auth/verify` endpoint
   - Returns `{valid: boolean, user?: {...}, message?: string}`
   - Used for periodic checks and initial authentication

3. **Enhanced authFetch** ([packages/web/src/features/authentication/utils/authFetch.ts](../../packages/web/src/features/authentication/utils/authFetch.ts))
   - Intercepts 401 responses from any API call
   - Automatically triggers global logout on authentication failures
   - Ensures no stale token is used for requests

4. **App.tsx Integration** ([packages/web/src/App.tsx](../../packages/web/src/App.tsx))
   - Initial token verification on application load
   - Periodic validation every 5 minutes
   - Automatic logout when token becomes invalid

#### Token Expiry Flow

```
Scenario 1: Periodic Check Detects Expiry
┌─────────────────────────────────────────┐
│ Timer triggers (every 5 minutes)        │
│         ↓                               │
│ verifyToken() → GET /api/auth/verify   │
│         ↓                               │
│ Server: 401 (FAST_JWT_EXPIRED)         │
│         ↓                               │
│ {valid: false} returned                │
│         ↓                               │
│ App.tsx: setIsAuthenticated(false)     │
│         ↓                               │
│ localStorage.removeItem('_auth')       │
│         ↓                               │
│ React Router → Redirect to /login      │
└─────────────────────────────────────────┘

Scenario 2: User Action with Expired Token
┌─────────────────────────────────────────┐
│ User clicks "Run All Tests"             │
│         ↓                               │
│ authPost('/api/tests/run-all')         │
│         ↓                               │
│ Server: 401 (token expired)            │
│         ↓                               │
│ authFetch catches 401                  │
│         ↓                               │
│ getGlobalLogout()() → handleLogout()   │
│         ↓                               │
│ setIsAuthenticated(false)              │
│         ↓                               │
│ localStorage.removeItem('_auth')       │
│         ↓                               │
│ React Router → Redirect to /login      │
└─────────────────────────────────────────┘

Scenario 3: WebSocket Disconnect
┌─────────────────────────────────────────┐
│ WebSocket auth fails (expired token)    │
│         ↓                               │
│ Connection closes, UI shows "Disconn..."│
│         ↓                               │
│ Next periodic check (≤ 5 minutes)      │
│         ↓                               │
│ verifyToken() detects invalid token    │
│         ↓                               │
│ Automatic logout → Redirect to /login   │
└─────────────────────────────────────────┘
```

#### Configuration

Token expiry duration is configured via environment variable:

```bash
JWT_EXPIRES_IN=24h  # Default: 24 hours
```

**Supported formats**:
- `"1m"` - 1 minute
- `"15m"` - 15 minutes
- `"1h"` - 1 hour
- `"24h"` - 24 hours (default)
- `"7d"` - 7 days

#### Testing Token Expiry

To test the automatic logout behavior:

1. **Quick Test (1 minute expiry)**:
   ```bash
   # In .env
   JWT_EXPIRES_IN=1m
   ```
   - Login to dashboard
   - Wait 1 minute + periodic check (≤ 5 minutes)
   - Verify automatic redirect to login

2. **API Action Test**:
   ```bash
   # In .env
   JWT_EXPIRES_IN=1m
   ```
   - Login to dashboard
   - Wait 1+ minute
   - Click any action (Run All, Rerun Test, etc.)
   - Verify immediate redirect to login on 401 response

3. **WebSocket Test**:
   - Set short expiry (e.g., `1m`)
   - Login and observe "Live Updates: Connected"
   - Wait for token to expire
   - Observe "Disconnected" status
   - Wait up to 5 minutes for periodic check
   - Verify automatic logout and redirect

## API Reference

### Authentication Endpoints

#### POST /api/auth/login

Authenticate user with email and password.

**Request:**

```json
{
    "email": "admin@admin.com",
    "password": "qwe123"
}
```

**Response:**

```json
{
    "status": "success",
    "data": {
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "user": {
            "email": "admin@admin.com",
            "role": "admin"
        },
        "expiresIn": "24h"
    }
}
```

#### POST /api/auth/logout

Invalidate current user session.

**Response:**

```json
{
    "status": "success",
    "data": {
        "message": "Successfully logged out"
    }
}
```

#### GET /api/auth/verify

Verify JWT token validity.

**Headers:**

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**

```json
{
    "status": "success",
    "data": {
        "valid": true,
        "user": {
            "email": "admin@admin.com",
            "role": "admin"
        }
    }
}
```

### Protected Endpoints

All existing API endpoints require authentication:

#### Web UI Access (JWT required):

```
Authorization: Bearer <jwt-token>
```

#### API Endpoints:

Reporter API endpoints (`/api/tests/*`, `/api/runs/*`) are publicly accessible for local network integration.

#### Special Trace File Access:

The trace file endpoint uses query-based JWT authentication for compatibility with Playwright Trace Viewer:

```
GET /api/tests/traces/:attachmentId?token=jwt_token
```

### Public Endpoints

These endpoints remain publicly accessible:

- `GET /api/health`
- `GET /api/tests/diagnostics`

### Protected Endpoints with Special Authentication

#### Trace File Download (Query-based JWT)

**Endpoint:** `GET /api/tests/traces/:attachmentId`

This endpoint uses a special authentication method where the JWT token is passed as a query parameter instead of an Authorization header. This is required for compatibility with Playwright Trace Viewer.

**Authentication:**

```
GET /api/tests/traces/att_123?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Usage:**

- Frontend extracts JWT from localStorage
- Constructs URL with token query parameter
- Passes URL to Playwright Trace Viewer
- Trace Viewer makes direct HTTP request with token

**Example Frontend Implementation:**

```javascript
const openTraceViewer = async (attachment) => {
    const token = getAuthToken()
    const traceURL = `${config.api.serverUrl}/api/tests/traces/${attachment.id}?token=${encodeURIComponent(token)}`
    window.open(`https://trace.playwright.dev/?trace=${encodeURIComponent(traceURL)}`, '_blank')
}
```

## Configuration

### Environment Variables

#### Required for Authentication:

```bash
# Admin User Credentials
ADMIN_EMAIL=admin@admin.com
ADMIN_PASSWORD=qwe123

# JWT Configuration
JWT_SECRET=your-secure-jwt-secret-key
JWT_EXPIRES_IN=24h

# Authentication Control
ENABLE_AUTH=true
```

#### Multi-User Support (Optional):

```bash
# JSON array of users
ADMIN_USERS='[{"email":"admin@admin.com","password":"qwe123","role":"admin"},{"email":"user2@example.com","password":"pass2","role":"user"}]'
```

### Production Configuration

Update your `.env.production`:

```bash
# Existing production config...
PORT=3001
NODE_ENV=production
BASE_URL=https://api-dashboard.shvydak.com
VITE_BASE_URL=https://api-dashboard.shvydak.com

# Add authentication config
ADMIN_EMAIL=your-admin@email.com
ADMIN_PASSWORD=your-secure-password
JWT_SECRET=your-production-jwt-secret
ENABLE_AUTH=true
```

## Frontend Integration

### Authentication Architecture

The frontend uses a **simplified localStorage-based authentication** system that is production-ready and optimized:

- **No external dependencies**: Custom implementation without react-auth-kit
- **localStorage storage**: JWT tokens stored securely in browser localStorage
- **Automatic token inclusion**: `authFetch` utility automatically adds Bearer tokens
- **Security optimized**: No hardcoded credentials, production-ready code

### Login Component Implementation

```jsx
// LoginPage.tsx - Actual implementation
const LoginPage = () => {
    const [formData, setFormData] = useState({
        email: '', // No hardcoded credentials
        password: '', // Credentials come from .env via backend
    })

    const handleSubmit = async (e) => {
        e.preventDefault()
        const response = await fetch(`${config.api.baseUrl}/auth/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(formData),
        })

        const data = await response.json()
        if (response.ok && data.success) {
            // Store token in localStorage
            localStorage.setItem(
                '_auth',
                JSON.stringify({
                    auth: {
                        token: data.data.token,
                        type: 'Bearer',
                    },
                    user: data.data.user,
                })
            )
            // Simple navigation to dashboard
            window.location.href = '/'
        }
    }
}
```

### Authentication State Management

```jsx
// App.tsx - Actual implementation
function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const checkAuth = () => {
            try {
                const authData = localStorage.getItem('_auth')
                if (authData) {
                    const parsed = JSON.parse(authData)
                    const hasToken = parsed?.auth?.token || parsed?.token
                    setIsAuthenticated(!!hasToken)
                }
            } catch (error) {
                setIsAuthenticated(false)
            } finally {
                setIsLoading(false)
            }
        }
        checkAuth()
    }, [])

    // Conditional rendering based on auth state
    if (!isAuthenticated) {
        return (
            <Routes>
                <Route path="*" element={<LoginPage />} />
            </Routes>
        )
    }

    return <AuthenticatedApp />
}
```

### Authenticated API Requests

```jsx
// authFetch.ts - Production-ready utility
export async function authFetch(url, options = {}) {
    const headers = createAuthHeaders(options.headers)
    const response = await fetch(url, {...options, headers})

    // Handle authentication errors
    if (response.status === 401) {
        localStorage.removeItem('_auth')
        sessionStorage.removeItem('_auth')
        throw new Error('Authentication required')
    }

    return response
}

function createAuthHeaders(additionalHeaders = {}) {
    const headers = {'Content-Type': 'application/json', ...additionalHeaders}
    const token = getAuthToken()
    if (token) {
        headers['Authorization'] = `Bearer ${token}`
    }
    return headers
}
```

## WebSocket Authentication

WebSocket connections authenticate via JWT token in query parameters with **optimized timing**:

```javascript
// App.tsx - Optimized WebSocket connection timing
const webSocketUrl = useMemo(() => {
    // Only connect to WebSocket if we're authenticated AND not loading
    if (isAuthenticated && !isLoading) {
        try {
            const authData = localStorage.getItem('_auth') || sessionStorage.getItem('_auth')
            if (authData) {
                const parsedAuth = JSON.parse(authData)
                let token = null

                if (parsedAuth?.auth?.token) {
                    token = parsedAuth.auth.token
                } else if (parsedAuth?.token) {
                    token = parsedAuth.token
                }

                if (token) {
                    return `${config.websocket.url}?token=${encodeURIComponent(token)}`
                }
            }
        } catch (error) {
            // Silent error handling
        }
    }

    // Return null to prevent WebSocket connection when not ready
    if (isLoading) {
        return null
    }

    return config.websocket.url
}, [isAuthenticated, isLoading])

// useWebSocket hook handles null URLs properly
const {isConnected} = useWebSocket(webSocketUrl)
```

**Server-side validation:**

```javascript
// WebSocket connection handler
const url = new URL(request.url, 'http://localhost')
const token = url.searchParams.get('token')
const isValid = await validateJWT(token)
```

## Static File Protection

All static file endpoints are protected with authentication:

```javascript
// Protected static routes
app.use('/reports', authMiddleware, express.static(reportsPath))
app.use('/attachments', authMiddleware, express.static(attachmentsPath))
app.use('/test-results', authMiddleware, express.static(testResultsPath))
```

Users must be authenticated to access:

- Test screenshots and videos
- Test reports and artifacts
- Attachment files

## Reporter Integration

### External Reporter Compatibility

The external reporter at `/Users/y.shvydak/QA/probuild-qa/e2e/testUtils/yshvydakReporter.ts` requires minimal changes:

**Simple API requests:**

```typescript
const response = await fetch(`${this.apiBaseUrl}/api/tests`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(result),
})
```

### Reporter Environment Setup

In your test project's `.env`:

```bash
DASHBOARD_API_URL=https://api-dashboard.shvydak.com
```

## Deployment Guide

### Development Setup

1. **Install dependencies:**

    ```bash
    npm install fast-jwt react-auth-kit
    ```

2. **Configure environment:**

    ```bash
    cp .env.example .env
    # Edit .env with your auth credentials
    ```

3. **Start services:**
    ```bash
    npm run dev
    ```

### Production Deployment (Raspberry Pi + CloudTunnel)

1. **Update production environment:**

    ```bash
    # Edit .env.production with secure credentials
    ADMIN_EMAIL=your-production-admin@email.com
    ADMIN_PASSWORD=your-secure-password
    JWT_SECRET=your-long-secure-jwt-secret-key
    ```

2. **Deploy to production:**

    ```bash
    cp .env.production .env
    npm run build
    npm run dev:prod
    ```

3. **CloudTunnel configuration:**
    - API server (port 3001): `https://api-dashboard.shvydak.com`
    - Web client (port 3000): `https://test-dashboard.shvydak.com`
    - WebSocket: `wss://api-dashboard.shvydak.com/ws`

## Security Best Practices

### JWT Token Security

- **Expiration**: Default 24 hours, configurable
- **Secret**: Use cryptographically secure random string (64+ characters)
- **Storage**: Secure HTTP-only cookies in production
- **Transmission**: HTTPS only in production

### Network Security

- **Local Network**: Dashboard designed for local network deployment
- **HTTPS**: Use HTTPS in production environments
- **Environment**: Store secrets in environment variables, never in code
- **Logging**: Never log JWT tokens or sensitive data

### Password Security

- **Complexity**: Enforce strong passwords in production
- **Storage**: Environment variables only, never in database
- **Transmission**: HTTPS only
- **Hashing**: Consider bcrypt for future database storage

## Monitoring and Troubleshooting

### Health Checks

- `GET /api/health` - Overall system health
- `GET /api/tests/diagnostics` - Integration status including auth

### Authentication Debugging

#### Common Issues:

1. **WebSocket connection fails** - Check JWT token in query params
2. **Static files return 401** - Ensure auth headers in requests
3. **Reporter connection fails** - Verify DASHBOARD_API_URL environment variable
4. **Login redirects infinitely** - Check JWT secret consistency

#### Debug Logging:

```javascript
// Enable auth debugging
DEBUG=auth:* npm run dev
```

### Production Monitoring

- Monitor authentication failure rates
- Track JWT token expiration patterns
- Monitor reporter API connection health
- Set up alerts for authentication errors

## Migration Guide

### Upgrading Existing Installation

1. **Backup current configuration:**

    ```bash
    cp .env .env.backup
    ```

2. **Add authentication environment variables**
3. **Update frontend with AuthProvider**
4. **Test authentication flows**
5. **Test authentication flows**
6. **Deploy gradually with rollback plan**

## API Compatibility

### Backward Compatibility

- All existing API endpoints maintain same request/response format
- WebSocket events unchanged
- Database schema unchanged
- Reporter integration requires only header addition

### Version Support

- Current version: v1.0.0+auth
- Minimum supported: v1.0.0
- Breaking changes: None

## Production Code Optimization

The authentication system has been **production-optimized** with comprehensive code cleanup:

### Security Improvements

- **Removed hardcoded credentials**: No credentials in frontend code
- **Environment-based config**: All secrets from .env variables
- **Clean error handling**: Silent fallbacks without exposing internals

### Performance Optimization

- **Minimal logging**: Removed debug console.log statements (kept console.error for error handling)
- **Optimized WebSocket timing**: Prevents premature connections and authentication failures
- **Efficient state management**: Clean localStorage-based authentication flow

### Code Quality

- **Removed unused components**: Eliminated TestApp.tsx and other unused files
- **TypeScript compliance**: All frontend code passes type-check
- **Production-ready**: Clean, maintainable, and secure implementation

For detailed code optimization information, see [Code Optimization Guide](./CODE_OPTIMIZATION.md).

## Related Documentation

- [Architecture Overview](../ARCHITECTURE.md)
- [Development Guidelines](../DEVELOPMENT.md)
- [Configuration Details](../CONFIGURATION.md)
- [Deployment Guide](../DEPLOYMENT.md)
- [API Reference](../API_REFERENCE.md)
- [Code Optimization Guide](./CODE_OPTIMIZATION.md)

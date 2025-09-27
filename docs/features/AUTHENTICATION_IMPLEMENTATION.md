# Authentication Implementation

## Overview

The YShvydak Test Dashboard implements a robust JWT-based authentication system with API Key support for external reporter integration. This ensures secure access to the dashboard while maintaining full compatibility with existing functionality and deployment scenarios.

## Architecture

### Authentication Strategy: Hybrid Dual-Layer

The system implements **two parallel authentication mechanisms**:

1. **JWT Authentication** - For user browser sessions
2. **API Key Authentication** - For external reporter integration

Both mechanisms can access the same API endpoints, providing flexibility without compromising security.

### Technology Stack

- **Backend JWT**: `fast-jwt` - High-performance JWT library for Node.js
- **Frontend Auth**: `react-auth-kit` - Comprehensive React authentication solution
- **Storage**: Environment variables for credentials and API keys
- **Architecture**: Integrated with existing layered architecture pattern

## Security Model

### User Authentication Flow
```
1. User visits dashboard → Redirect to login page
2. User submits credentials → Server validates against .env
3. Server generates JWT token → Client stores token
4. Client includes JWT in all API requests → Server validates JWT
5. WebSocket connection includes JWT via query params
```

### Reporter Authentication Flow
```
1. Reporter starts → Reads REPORTER_API_KEY from environment
2. Reporter includes API key in request headers
3. Server validates API key → Grants access to reporter endpoints
4. Reporter functions normally without user session dependency
```

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

#### User Requests (JWT required):
```
Authorization: Bearer <jwt-token>
```

#### Reporter Requests (API Key required):
```
X-API-Key: <reporter-api-key>
```

### Public Endpoints
These endpoints remain publicly accessible:
- `GET /api/health`
- `GET /api/tests/diagnostics`

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

# Reporter API Key
REPORTER_API_KEY=your-secure-reporter-api-key

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
REPORTER_API_KEY=your-production-reporter-key
ENABLE_AUTH=true
```

## Frontend Integration

### AuthProvider Setup

```jsx
import { AuthProvider } from 'react-auth-kit'
import App from './App'

function Root() {
  return (
    <AuthProvider
      authType="Bearer"
      authName="_auth"
      cookieDomain={window.location.hostname}
      cookieSecure={window.location.protocol === 'https:'}
    >
      <App />
    </AuthProvider>
  )
}
```

### Login Component Usage

```jsx
import { useSignIn } from 'react-auth-kit'

const LoginPage = () => {
  const signIn = useSignIn()

  const handleLogin = async (email, password) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })

    const data = await response.json()

    if (data.status === 'success') {
      signIn({
        auth: { token: data.data.token, type: 'Bearer' },
        userState: data.data.user
      })
      // Redirect to dashboard
    }
  }
}
```

### Protected Routes

```jsx
import { AuthOutlet } from 'react-auth-kit'

function App() {
  return (
    <Router>
      <Routes>
        <Route element={<AuthOutlet fallbackPath='/login' />}>
          <Route path='/' element={<Dashboard />} />
          <Route path='/tests' element={<TestsList />} />
        </Route>
        <Route path='/login' element={<LoginPage />} />
      </Routes>
    </Router>
  )
}
```

## WebSocket Authentication

WebSocket connections authenticate via JWT token in query parameters:

```javascript
const token = getAuthToken() // From React Auth Kit
const wsUrl = `${config.websocket.url}?token=${token}`
const websocket = new WebSocket(wsUrl)
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

**Add API Key header to all requests:**
```typescript
const response = await fetch(`${this.apiBaseUrl}/api/tests`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.REPORTER_API_KEY
  },
  body: JSON.stringify(result)
})
```

### Reporter Environment Setup

In your test project's `.env`:
```bash
REPORTER_API_KEY=your-reporter-api-key
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
   REPORTER_API_KEY=your-secure-reporter-api-key
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

### API Key Security
- **Generation**: Use cryptographically secure random strings
- **Rotation**: Regularly rotate API keys
- **Environment**: Store in environment variables, never in code
- **Logging**: Never log API keys or JWT tokens

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
3. **Reporter fails** - Verify REPORTER_API_KEY environment variable
4. **Login redirects infinitely** - Check JWT secret consistency

#### Debug Logging:
```javascript
// Enable auth debugging
DEBUG=auth:* npm run dev
```

### Production Monitoring
- Monitor authentication failure rates
- Track JWT token expiration patterns
- Monitor API key usage for reporter
- Set up alerts for authentication errors

## Migration Guide

### Upgrading Existing Installation

1. **Backup current configuration:**
   ```bash
   cp .env .env.backup
   ```

2. **Add authentication environment variables**
3. **Update frontend with AuthProvider**
4. **Update reporter with API key**
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

## Related Documentation

- [Architecture Overview](../ARCHITECTURE.md)
- [Development Guidelines](../DEVELOPMENT.md)
- [Configuration Details](../CONFIGURATION.md)
- [Deployment Guide](../DEPLOYMENT.md)
- [API Reference](../API_REFERENCE.md)
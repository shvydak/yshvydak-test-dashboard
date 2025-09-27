# Authentication Development Notes
*This is a temporary development file containing all context, discussions, and technical decisions from the authentication implementation. DELETE after feature completion.*

## Original Requirements

User requested authentication implementation with these specific requirements:
- Login/password stored in .env files (not database, as it gets cleared with 'Clear All Data')
- Initial credentials: `ADMIN_EMAIL=admin@admin.com`, `ADMIN_PASSWORD=qwe123`
- Support for multiple users
- Logout functionality
- Full dashboard functionality after login (Clear All Data → Discover Tests → Run Tests)
- Complete integration with external reporter
- Modern UI matching current dashboard design
- Best practices implementation
- Context7-MCP documentation consultation
- Integration with existing project architecture

## Technical Analysis Conducted

### Project Structure Analysis
- **Monorepo**: Turborepo with packages/core, packages/reporter, packages/server, packages/web
- **Architecture**: Layered architecture with Controllers → Services → Repositories
- **Tech Stack**: Express.js + TypeScript + React + SQLite + WebSocket
- **Deployment**: Raspberry Pi + CloudTunnel with .env.production

### External Reporter Analysis
**Critical Discovery**: Reporter at `/Users/y.shvydak/QA/probuild-qa/e2e/testUtils/yshvydakReporter.ts` makes these API calls:
1. `POST /api/tests` - Send test results
2. `POST /api/runs` - Create test run
3. `PUT /api/runs/{id}` - Update test run
4. `POST /api/tests/process-start` - Process start notification
5. `POST /api/tests/process-end` - Process end notification

**Reporter Authentication Challenge**:
- Reporter runs in Playwright process, not browser
- No access to user JWT tokens
- Currently sends only `Content-Type: application/json` headers
- No error handling for 401/403 responses

## Identified Critical Problems & Solutions

### 🚨 Problem 1: WebSocket Authentication
**Issue**: WebSocket in `useWebSocket.ts` has no authentication mechanism
```typescript
// Current code - no auth
wsRef.current = new WebSocket(url)
```

**Solution**: JWT via query parameters (WebSocket standard approach)
```typescript
const token = getAuthToken()
const wsUrl = `${config.websocket.url}?token=${token}`
const websocket = new WebSocket(wsUrl)
```

**Implementation Notes**:
- WebSocket doesn't support custom headers
- Query params are the standard method for WebSocket auth
- Server validates token from URL: `new URL(request.url).searchParams.get('token')`

### 🚨 Problem 2: Static Files Security
**Issue**: Static files in `app.ts` are unprotected:
```typescript
app.use('/reports', express.static(...))
app.use('/attachments', express.static(...))
app.use('/test-results', express.static(...))
```

**Solution**: Auth middleware for static routes
```typescript
app.use('/reports', authMiddleware, express.static(...))
app.use('/attachments', authMiddleware, express.static(...))
app.use('/test-results', authMiddleware, express.static(...))
```

### 🚨 Problem 3: Frontend API Calls Missing Auth
**Issue**: All fetch calls in `testsStore.ts` lack auth headers:
```typescript
const response = await fetch(`${API_BASE_URL}/tests?limit=200`) // No headers!
```

**Solution**: HTTP interceptor with React Auth Kit
```typescript
const authHeader = useAuthHeader()
const response = await fetch(url, {
  headers: { 'Authorization': authHeader }
})
```

### 🚨 Problem 4: Environment Configuration Complexity
**Issue**: `environment.config.ts` uses complex getter logic that may conflict with auth variables

**Solution**: Extend existing config pattern with auth section
```typescript
auth: {
  get jwtSecret() { return process.env.JWT_SECRET },
  get adminEmail() { return process.env.ADMIN_EMAIL },
  get reporterApiKey() { return process.env.REPORTER_API_KEY }
}
```

### 🚨 Problem 5: Process Restoration Logic
**Issue**: WebSocket `handleConnectionStatus` may break with user-specific processes

**Solution**: Keep processes global (not user-specific)
- Multiple users can see same test execution states
- Process tracking remains in memory as current implementation
- No changes needed to existing WebSocket logic

### 🚨 Problem 6: CORS for Reporter
**Issue**: Reporter may make CORS requests if dashboard on different domain

**Solution**: API Key bypass in CORS middleware
```typescript
app.use(corsMiddleware) // Allow reporter with API key
```

### 🚨 Problem 7: Health Endpoints Security
**Issue**: `/api/health` and `/api/tests/diagnostics` should remain public for monitoring

**Solution**: Whitelist public endpoints in auth middleware
```typescript
const publicEndpoints = ['/api/health', '/api/tests/diagnostics']
```

## Recommended Solution: Hybrid Authentication

### Architecture Decision: Dual Authentication System
1. **JWT Authentication** - For browser users
2. **API Key Authentication** - For external reporter

### Technical Implementation:
```typescript
// Auth middleware logic
if (req.headers['x-api-key']) {
  // Validate API Key (for reporter)
  return validateApiKey(req.headers['x-api-key'])
} else {
  // Validate JWT (for browser requests)
  return validateJWT(req.headers.authorization)
}
```

### Technology Stack Selected:
- **Backend**: `fast-jwt` (high performance, benchmarks show fastest)
- **Frontend**: `react-auth-kit` (comprehensive hooks, good documentation)
- **Storage**: Environment variables (as requested)

## Environment Configuration Plan

### New Variables Required:
```bash
# Authentication
ADMIN_EMAIL=admin@admin.com
ADMIN_PASSWORD=qwe123
JWT_SECRET=auto-generated-secure-secret
JWT_EXPIRES_IN=24h
REPORTER_API_KEY=secure-random-key-for-reporter
ENABLE_AUTH=true

# Multi-user support (future)
ADMIN_USERS='[{"email":"admin@admin.com","password":"qwe123"},{"email":"user2@example.com","password":"pass2"}]'
```

### Production Deployment (.env.production) Updates:
```bash
# Add to existing .env.production
ADMIN_EMAIL=production-admin@email.com
ADMIN_PASSWORD=secure-production-password
JWT_SECRET=long-secure-jwt-secret-for-production
REPORTER_API_KEY=secure-reporter-key-for-production
ENABLE_AUTH=true
```

## Reporter Integration Strategy

### Minimal Changes Required:
**Add API key header to all reporter requests:**
```typescript
// In yshvydakReporter.ts
headers: {
  'Content-Type': 'application/json',
  'X-API-Key': process.env.REPORTER_API_KEY
}
```

### Reporter Environment Setup:
```bash
# In test project .env
REPORTER_API_KEY=same-key-as-dashboard
DASHBOARD_API_URL=https://api-dashboard.shvydak.com
```

## Implementation Phases & Checklist

### Phase 1: Backend Foundation ✅
- [ ] Install `fast-jwt` dependency
- [ ] Create `AuthService` with JWT generation/validation
- [ ] Create `AuthController` with login/logout endpoints
- [ ] Build dual authentication middleware (JWT + API Key)
- [ ] Integrate with existing service injection middleware
- [ ] Add auth middleware to route protection

### Phase 2: Frontend Integration ✅
- [ ] Install `react-auth-kit` dependency
- [ ] Create `AuthProvider` wrapper component
- [ ] Build login page matching dashboard design
- [ ] Implement HTTP interceptor for automatic JWT injection
- [ ] Add route protection with `AuthOutlet`
- [ ] Update all store fetch calls with auth headers

### Phase 3: WebSocket & Static Files ✅
- [ ] Update WebSocket connection with JWT query params
- [ ] Protect static file routes with auth middleware
- [ ] Test WebSocket authentication flow
- [ ] Validate static file access control

### Phase 4: Reporter Integration ✅
- [ ] Add API Key environment variables
- [ ] Update reporter with API key headers
- [ ] Test reporter functionality with auth
- [ ] Validate all reporter endpoints work

### Phase 5: Production Testing ✅
- [ ] Update `.env.production` with auth config
- [ ] Test CloudTunnel + HTTPS compatibility
- [ ] Validate Raspberry Pi deployment
- [ ] End-to-end authentication testing
- [ ] Performance testing with auth overhead

## Technical Decisions Made

### JWT vs Sessions
**Decision**: JWT tokens
**Reasoning**: Stateless, works with WebSocket query params, no database storage needed

### JWT Storage Location
**Decision**: React Auth Kit default (localStorage with fallback to cookies)
**Reasoning**: Handles secure storage automatically, supports SSR

### API Key vs JWT for Reporter
**Decision**: Separate API Key authentication
**Reasoning**: Reporter runs outside browser, can't access JWT, needs independent auth

### Multi-user Implementation
**Decision**: Environment variable JSON array initially
**Reasoning**: Requested no database storage, can migrate to DB later if needed

### WebSocket Auth Method
**Decision**: JWT via query parameters
**Reasoning**: WebSocket standard approach, no custom headers support

### Static File Protection
**Decision**: Auth middleware before express.static
**Reasoning**: Reuses existing auth logic, consistent security model

## Security Considerations

### JWT Security:
- 24-hour expiration (configurable)
- Secure random secret (64+ characters)
- HTTPS-only in production
- No sensitive data in payload

### API Key Security:
- Cryptographically secure random generation
- Environment variable storage only
- Regular rotation capability
- No logging of key values

### Password Security:
- Environment variable storage (as requested)
- HTTPS transmission only
- Consider bcrypt hashing for future DB storage

## Raspberry Pi + CloudTunnel Compatibility

### WebSocket Support:
- CloudTunnel supports WSS (WebSocket Secure)
- JWT query params work with wss:// protocol
- Existing setup: `wss://api-dashboard.shvydak.com/ws`

### HTTPS Compatibility:
- All endpoints work with HTTPS through CloudTunnel
- Static file protection compatible with HTTPS
- JWT transmission secure over HTTPS

### Environment Variables:
- .env.production already configured for CloudTunnel
- Auth variables integrate seamlessly with existing setup
- No additional CloudTunnel configuration needed

## Testing Strategy

### Manual Testing Checklist:
- [ ] Login flow with correct credentials
- [ ] Login failure with incorrect credentials
- [ ] JWT token validation on API calls
- [ ] WebSocket connection with JWT
- [ ] Static file access with authentication
- [ ] Reporter API calls with API key
- [ ] Logout functionality
- [ ] Multi-user support (if implemented)
- [ ] Production deployment on Raspberry Pi
- [ ] CloudTunnel integration

### Automated Testing:
- [ ] Auth middleware unit tests
- [ ] JWT generation/validation tests
- [ ] API Key validation tests
- [ ] Integration tests for auth flows
- [ ] WebSocket auth connection tests

## Migration Considerations

### Existing Users:
- No breaking changes to existing functionality
- Gradual rollout possible with `ENABLE_AUTH=false`
- Rollback plan: disable auth and restart

### Database Impact:
- No database schema changes required
- Existing data remains untouched
- Clear All Data functionality unaffected

### Deployment Impact:
- Requires environment variable updates
- May need reporter re-deployment
- CloudTunnel configuration unchanged

## Performance Impact

### Expected Overhead:
- JWT validation: ~2-5ms per request (fast-jwt benchmarks)
- API Key validation: <1ms per request
- WebSocket: One-time token validation on connection
- Static files: Auth check adds ~1-2ms

### Optimization Opportunities:
- JWT token caching for WebSocket connections
- API Key validation caching
- Static file auth bypass for public assets

## Context7-MCP Research Results

### Fast-JWT Benefits:
- Fastest JWT library for Node.js (benchmark confirmed)
- Synchronous and asynchronous support
- High performance with ES256/HS256 algorithms
- Good error handling and customization

### React Auth Kit Benefits:
- Comprehensive hook system (useSignIn, useSignOut, useIsAuthenticated, useAuthHeader)
- Automatic token management
- TypeScript support
- SSR compatibility
- Route protection with AuthOutlet

## Deployment Commands Reference

### Development:
```bash
# Install dependencies
npm install fast-jwt react-auth-kit

# Configure environment
cp .env.example .env
# Edit .env with auth credentials

# Start development
npm run dev
```

### Production:
```bash
# Update production config
# Edit .env.production with secure credentials

# Deploy
cp .env.production .env
npm run build
npm run dev:prod
```

## Post-Implementation Tasks

### Documentation Updates:
- [ ] Update main CLAUDE.md with auth info
- [ ] Update API_REFERENCE.md with auth endpoints
- [ ] Update CONFIGURATION.md with new env vars
- [ ] Update DEPLOYMENT.md with auth setup

### Cleanup:
- [ ] Delete this development notes file
- [ ] Remove any temporary auth testing files
- [ ] Clean up any debug logging code

## Final Validation Checklist

### Core Functionality:
- [ ] All existing dashboard features work without changes
- [ ] External reporter integration functions perfectly
- [ ] WebSocket connections authenticate properly
- [ ] Static files are properly protected
- [ ] Production deployment on Raspberry Pi works
- [ ] Multiple users can access dashboard simultaneously
- [ ] Login/logout flow is intuitive and reliable

### Edge Cases:
- [ ] JWT token expiration handling
- [ ] Invalid API key rejection
- [ ] WebSocket reconnection with expired tokens
- [ ] Static file access without authentication
- [ ] Reporter failure scenarios
- [ ] Network interruption during auth

---

*Remember to delete this file after successful implementation and testing!*
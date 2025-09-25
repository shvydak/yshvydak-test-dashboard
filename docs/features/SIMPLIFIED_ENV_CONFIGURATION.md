# Simplified Environment Configuration

> **🎯 Goal**: Reduce .env complexity from 10+ variables to just 6 core variables with automatic derivation of all other values.

## Overview

The YShvydak Test Dashboard uses a **simplified environment configuration system** that eliminates duplication and reduces setup complexity. Users only need to configure 6 core variables, while all other configuration values are automatically derived.

## Core Concept

### Before (10+ Variables)
```bash
PORT=3001
NODE_ENV=development
PLAYWRIGHT_PROJECT_DIR=/path/to/tests
USE_NPM_REPORTER=false
BASE_URL=http://localhost:3001
DASHBOARD_API_URL=http://localhost:3001    # Duplicate of BASE_URL
OUTPUT_DIR=test-results
VITE_API_BASE_URL=http://localhost:3001/api # Derived from BASE_URL
VITE_WEBSOCKET_URL=ws://localhost:3001/ws   # Derived from BASE_URL  
VITE_SERVER_URL=http://localhost:3001       # Duplicate of BASE_URL
VITE_PORT=3000
```

### After (6 Variables)
```bash
# Core Configuration - Only these 6 variables needed
PORT=3001
NODE_ENV=development
PLAYWRIGHT_PROJECT_DIR=/path/to/tests
USE_NPM_REPORTER=false
BASE_URL=http://localhost:3001
VITE_BASE_URL=http://localhost:3001
VITE_PORT=3000  # Optional - will derive from PORT if not set
```

## Configuration Variables

### Required Core Variables

| Variable | Purpose | Example | Default |
|----------|---------|---------|---------|
| `PORT` | API server port | `3001` | `3001` |
| `NODE_ENV` | Environment mode | `development` | `development` |
| `PLAYWRIGHT_PROJECT_DIR` | Test project path | `/path/to/tests` | `process.cwd()` |
| `USE_NPM_REPORTER` | Reporter source | `false` | `false` |
| `BASE_URL` | Base URL for services | `http://localhost:3001` | `http://localhost:3001` |
| `VITE_BASE_URL` | Base URL for web client | `http://localhost:3001` | Same as BASE_URL |

### Optional Variables

| Variable | Purpose | Derivation Logic | Fallback |
|----------|---------|------------------|----------|
| `VITE_PORT` | Web dev server port | `VITE_PORT` → `PORT + 1000` → `4001` | `4001` |

### Automatically Derived Variables

These variables are computed automatically and don't need to be set:

| Variable | Derivation | Purpose |
|----------|------------|---------|
| `DASHBOARD_API_URL` | `BASE_URL` | Reporter API endpoint |
| `OUTPUT_DIR` | `test-results` | Storage directory |
| `VITE_API_BASE_URL` | `BASE_URL + '/api'` | Web API calls |
| `VITE_WEBSOCKET_URL` | `ws://BASE_URL/ws` | WebSocket connection |
| `VITE_SERVER_URL` | `BASE_URL` | Web server URL |

## Implementation Details

### Server Configuration (`packages/server/src/config/environment.config.ts`)

```typescript
export const config: EnvironmentConfig = {
    server: {
        port: parseInt(process.env.PORT || '3001'),
        environment: process.env.NODE_ENV || 'development'
    },
    api: {
        // Derive API base URL with fallback priority
        get baseUrl() {
            if (process.env.DASHBOARD_API_URL) return process.env.DASHBOARD_API_URL
            if (process.env.BASE_URL) return process.env.BASE_URL
            return `http://localhost:${config.server.port}`
        }
    }
}
```

### Web Configuration (`packages/web/src/config/environment.config.ts`)

```typescript
function getBaseUrl(): string {
    if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL
    if (import.meta.env.VITE_BASE_URL) return import.meta.env.VITE_BASE_URL  
    return 'http://localhost:3001' // Fallback
}

export const config: WebEnvironmentConfig = {
    api: {
        baseUrl: import.meta.env.VITE_API_BASE_URL || `${getBaseUrl()}/api`,
        serverUrl: getBaseUrl()
    },
    websocket: {
        url: import.meta.env.VITE_WEBSOCKET_URL || 
             getBaseUrl().replace('http://', 'ws://') + '/ws'
    }
}
```

### Vite Configuration (`packages/web/vite.config.ts`)

```typescript
import * as dotenv from 'dotenv'

// Critical: Load .env explicitly for vite.config.ts
dotenv.config({ path: path.resolve(__dirname, '../..', '.env') })

export default defineConfig({
    server: {
        // Port derivation: VITE_PORT → PORT-1 → fallback
        port: parseInt(process.env.VITE_PORT || 
                      (process.env.PORT ? 
                       (parseInt(process.env.PORT) - 1).toString() : 
                       '4001'))
    }
})
```

## Port Management Strategy

### Development Ports
- **API Server**: Uses `PORT` (default: 3001)
- **Web Dev Server**: Uses `VITE_PORT` if set, otherwise `PORT + 1000`, fallback: 4001
- **Automatic Conflict Avoidance**: Ports are derived to prevent conflicts

### Port Derivation Logic
```
Web Dev Server Port:
1. If VITE_PORT is set → use VITE_PORT
2. If PORT is set → use PORT + 1000  
3. Fallback → 4001
```

### Examples
| PORT | VITE_PORT | API Server | Web Server |
|------|-----------|------------|------------|
| 3001 | (not set) | 3001 | 4001 |
| 3001 | 3000 | 3001 | 3000 |
| 8080 | (not set) | 8080 | 9080 |

## Troubleshooting

### Common Issues

#### 1. Vite Not Reading .env Variables
**Symptoms:** 
- Web server starts on wrong port (4001 instead of VITE_PORT)
- Environment debug shows `VITE_PORT: undefined`

**Cause:** Vite doesn't load .env during configuration phase

**Solution:** Ensure `vite.config.ts` has explicit dotenv loading:
```typescript
import * as dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../..', '.env') })
```

#### 2. Port Conflicts
**Symptoms:** 
- "Port already in use" errors
- Services not accessible

**Solution:** 
- Set different `VITE_PORT` value
- Change `PORT` to unused port
- Use port derivation (PORT + 1000)

#### 3. API Connection Failures
**Symptoms:** 
- "Failed to fetch" errors in browser
- WebSocket connection failures

**Cause:** Mismatch between web client URL and API server URL

**Solution:**
- Ensure `BASE_URL` matches actual API server address
- Verify `VITE_BASE_URL` is accessible from browser
- Check both server and web are running

#### 4. Environment Variables Not Loading
**Symptoms:**
- Services use fallback values instead of .env values
- Debug logs show undefined variables

**Solutions:**
- Restart both server and web dev servers after .env changes
- Verify .env file location (project root)
- Check .env file syntax (no spaces around =)

### Debug Environment Loading

#### Server Debug
Add to server startup:
```typescript
console.log('Server ENV:', {
    PORT: process.env.PORT,
    BASE_URL: process.env.BASE_URL,
    PLAYWRIGHT_PROJECT_DIR: process.env.PLAYWRIGHT_PROJECT_DIR
})
```

#### Web Client Debug  
Check browser console for:
```javascript
🔍 Environment variables debug: {
    VITE_BASE_URL: "http://localhost:3001",
    VITE_PORT: "3000"
}
```

#### Vite Config Debug
Add to `vite.config.ts`:
```typescript
console.log('Vite Config ENV Debug:', {
    VITE_PORT: process.env.VITE_PORT,
    PORT: process.env.PORT
})
```

## Migration Guide

### From Old Configuration

1. **Backup current .env**:
   ```bash
   cp .env .env.backup
   ```

2. **Create simplified .env**:
   ```bash
   # Keep only core variables
   PORT=3001
   NODE_ENV=development
   PLAYWRIGHT_PROJECT_DIR=/your/test/path
   USE_NPM_REPORTER=false
   BASE_URL=http://localhost:3001
   VITE_BASE_URL=http://localhost:3001
   VITE_PORT=3000
   ```

3. **Remove derived variables**:
   - Delete `DASHBOARD_API_URL`
   - Delete `OUTPUT_DIR` (uses default)
   - Delete `VITE_API_BASE_URL`
   - Delete `VITE_WEBSOCKET_URL`
   - Delete `VITE_SERVER_URL`

4. **Restart services**:
   ```bash
   npm run dev  # Restart both server and web
   ```

### Validation

Verify the migration worked:
1. **API Server**: Check http://localhost:3001/api/health
2. **Web Client**: Check http://localhost:3000 (or your VITE_PORT)
3. **WebSocket**: Browser console should show successful WebSocket connection
4. **Test Integration**: Run test discovery to verify PLAYWRIGHT_PROJECT_DIR

## Advanced Configuration

### Override Support

You can still override any derived variable for special cases:

```bash
# Core variables
PORT=3001
BASE_URL=http://localhost:3001
VITE_BASE_URL=http://localhost:3001

# Override specific derived values if needed
DASHBOARD_API_URL=http://custom-api:8080
VITE_WEBSOCKET_URL=wss://custom-ws:8080/ws
OUTPUT_DIR=/custom/storage/path
```

### Multiple Environments

Create environment-specific files:

**.env.development**:
```bash
PORT=3001
BASE_URL=http://localhost:3001
VITE_BASE_URL=http://localhost:3001
```

**.env.production**:
```bash
PORT=8080
BASE_URL=https://dashboard.mycompany.com
VITE_BASE_URL=https://dashboard.mycompany.com
```

### Docker Configuration

```dockerfile
ENV PORT=3001
ENV BASE_URL=http://dashboard:3001  
ENV VITE_BASE_URL=http://dashboard:3001
ENV PLAYWRIGHT_PROJECT_DIR=/app/tests
```

## Benefits

### For Users
- **Simpler Setup**: Only 6 variables vs 10+
- **Fewer Errors**: No duplicate values to keep in sync
- **Clear Intent**: Core variables are obvious
- **Easy Scaling**: Change ports centrally

### For Developers  
- **DRY Principle**: Single source of truth for URLs
- **Maintainable**: Logic centralized in config files
- **Flexible**: Override system for special cases
- **Backward Compatible**: Old variables still work

### For DevOps
- **Environment Parity**: Same variables across environments
- **Container Friendly**: Fewer environment variables to manage
- **Configuration Drift Prevention**: Derived values always consistent
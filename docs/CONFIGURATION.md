# Configuration Details

## Simplified Environment Configuration

The project uses a **minimal .env configuration** where users only need to set 6 core variables. All other configuration values are automatically derived to eliminate duplication and reduce setup complexity.

## Required User Configuration (6 core variables only)

- `PORT` - API server port (default: 3001)
- `NODE_ENV` - Environment mode (development/production)
- `PLAYWRIGHT_PROJECT_DIR` - Path to your Playwright project directory (REQUIRED)
- `USE_NPM_REPORTER` - Use npm package vs local reporter file (true/false)
- `BASE_URL` - Base URL for all services (e.g., http://localhost:3001)
- `VITE_BASE_URL` - Same as BASE_URL but accessible to web client
- `VITE_PORT` - Web development server port (optional, defaults to derived value)

## Automatically Derived Variables

- `DASHBOARD_API_URL` - Derived from BASE_URL (for server API)
- `OUTPUT_DIR` - Defaults to 'test-results' directory
- `VITE_API_BASE_URL` - Derived as BASE_URL + '/api' (for web API)
- `VITE_WEBSOCKET_URL` - Derived as 'ws://' + BASE_URL + '/ws' (for WebSocket)
- `VITE_SERVER_URL` - Same as BASE_URL (for web server)

## Override Support

Advanced users can still override any derived variable by setting it explicitly in .env. The system maintains backward compatibility with all existing environment variables.

## Technical Requirements

- **Vite dotenv**: The web package requires explicit dotenv loading in `vite.config.ts` to access environment variables during configuration
- **Port Management**: Web dev server uses `VITE_PORT` if set, otherwise derives from `PORT - 1`, with fallback to 4001
- **Environment Isolation**: Server variables (PORT, BASE_URL) are separate from client variables (VITE_*)

## Technical Details

- **Requirements**: Node.js 18+ and npm 10+ required
- **Database**: SQLite with automatic schema initialization
- **Test Discovery**: Fully automated - no manual file generation required. Uses `npx playwright test --list --reporter=json` internally
- **Configuration Access**: Server uses centralized `config` object, web uses `import.meta.env` with Vite prefix

## Configuration Files

### Server Configuration

Environment variables are managed in:
- `packages/server/src/config/environment.config.ts` - Environment variable handling
- `packages/server/src/config/constants.ts` - Application constants

### Web Configuration

- `packages/web/vite.config.ts` - Vite configuration with explicit dotenv loading
- Environment variables prefixed with `VITE_` are available in the client

## Example .env Configuration

```bash
# Core Configuration (6 variables only)
PORT=3001                                    # API server port
NODE_ENV=development                         # Environment mode
PLAYWRIGHT_PROJECT_DIR=/path/to/your/tests   # Test project location
USE_NPM_REPORTER=false                       # Use npm package vs local file
BASE_URL=http://localhost:3001               # Base URL for all services
VITE_BASE_URL=http://localhost:3001          # Base URL accessible to web client
VITE_PORT=3000                               # Web dev server port (optional)

# All other variables are derived automatically:
# - DASHBOARD_API_URL = BASE_URL (for API integration)
# - VITE_API_BASE_URL = BASE_URL/api (for web API calls)
# - VITE_WEBSOCKET_URL = ws://BASE_URL/ws (for WebSocket)
# - OUTPUT_DIR = test-results (default storage)

# Advanced users can still override any derived variable
```

## Port Management

- **API Server**: Uses `PORT` (default: 3001)
- **Web Dev Server**: Uses `VITE_PORT` if set, otherwise `PORT + 1000`, fallback: 4001
- **Production**: Both services can run on same port with different paths

## Environment Modes

### Development
- Uses localhost URLs
- All development features enabled
- Hot reload and fast refresh

### Production
- Uses production URLs (CloudTunnel domains)
- Optimized builds
- Production-ready configuration

## Related Documentation

- [Architecture Overview](./ARCHITECTURE.md)
- [Development Guidelines](./DEVELOPMENT.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Simplified Environment Configuration](./SIMPLIFIED_ENV_CONFIGURATION.md)
- [Attachment Management System](./features/PER_RUN_ATTACHMENTS.md)
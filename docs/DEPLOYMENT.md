# Deployment Guide

## Internet Deployment with CloudTunnel

For deploying the dashboard over the internet using cloudtunnel and custom domain:

## Setup Requirements

1. **CloudTunnel Configuration**
    - Configure cloudtunnel for port 3001 (API server) to a subdomain like `api-dashboard.shvydak.com`
    - Configure cloudtunnel for port 3000 (web) to your main domain like `test-dashboard.shvydak.com`

2. **Environment Configuration**
    - For **local development**: Use `.env` (localhost URLs)
    - For **production/internet**: Copy `.env.production` to `.env` and update domains

## Production Deployment Steps

### 1. Setup CloudTunnel for API Server

```bash
# Configure cloudtunnel to expose port 3001 as api-dashboard.shvydak.com
cloudtunnel config add api-server 3001 api-dashboard.shvydak.com
```

### 2. Update Environment Configuration

```bash
# Copy production environment template
cp .env.production .env

# Edit .env and replace with your actual cloudtunnel domains:
# BASE_URL=https://api-dashboard.shvydak.com
# VITE_BASE_URL=https://api-dashboard.shvydak.com
```

### 3. Start Services

```bash
# Start cloudtunnel (ensure both ports are exposed)
cloudtunnel start

# Start dashboard in production mode
npm run dev:prod
```

## Key Architecture Notes

- **Web Client**: Served from `test-dashboard.shvydak.com` (port 3000 via cloudtunnel)
- **API Server**: Accessible at `api-dashboard.shvydak.com` (port 3001 via cloudtunnel)
- **WebSocket**: Uses same API domain with `wss://` protocol
- **Environment**: All URL derivation handled automatically through configuration

## Troubleshooting

- **API calls fail**: Verify `BASE_URL` and `VITE_BASE_URL` point to your actual cloudtunnel API domain
- **WebSocket fails**: Ensure cloudtunnel supports WebSocket connections on the API port
- **CORS issues**: Server is configured with permissive CORS for development

## Development vs Production

| Environment | Web URL                    | API URL                   | Configuration              |
| ----------- | -------------------------- | ------------------------- | -------------------------- |
| Development | localhost:3000             | localhost:3001            | `.env`                     |
| Production  | test-dashboard.shvydak.com | api-dashboard.shvydak.com | `.env.production` → `.env` |

## Environment Files

### Local Development (.env)

```bash
PORT=3001
NODE_ENV=development
BASE_URL=http://localhost:3001
VITE_BASE_URL=http://localhost:3001
PLAYWRIGHT_PROJECT_DIR=/path/to/your/playwright/project
```

### Production (.env.production → .env)

```bash
PORT=3001
NODE_ENV=production
BASE_URL=https://api-dashboard.shvydak.com
VITE_BASE_URL=https://api-dashboard.shvydak.com
PLAYWRIGHT_PROJECT_DIR=/path/to/your/playwright/project
```

## Security Considerations

- **CORS Configuration**: Server allows all origins in development mode
- **Environment Variables**: Never commit sensitive data to version control
- **CloudTunnel Security**: Ensure proper authentication and access controls

## Monitoring and Maintenance

### Health Checks

- **API Health**: `GET /api/health`
- **Diagnostics**: `GET /api/tests/diagnostics`
- **WebSocket Status**: Monitor connection events in browser console

### Log Management

- Server logs available through application logging
- Client-side errors visible in browser developer tools
- WebSocket connection status logged in console

## Backup and Recovery

### Database Backup

```bash
# SQLite database backup
cp packages/server/database.db packages/server/database.db.backup
```

### Configuration Backup

```bash
# Environment configuration backup
cp .env .env.backup
cp .env.production .env.production.backup
```

## Related Documentation

- [Architecture Overview](./ARCHITECTURE.md)
- [Configuration Details](./CONFIGURATION.md)
- [Development Guidelines](./DEVELOPMENT.md)
- [API Reference](./API_REFERENCE.md)
- [Attachment Management System](./features/PER_RUN_ATTACHMENTS.md)

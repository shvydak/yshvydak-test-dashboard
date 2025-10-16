# Quick Start Guide

Get your Playwright Dashboard up and running in 5 minutes.

## Prerequisites

- Node.js 18+ and npm 10+
- Existing Playwright project with tests

## Step 1: Clone Dashboard (2 min)

```bash
# Clone repository
git clone https://github.com/yshvydak/yshvydak-test-dashboard.git
cd yshvydak-test-dashboard

# Install dependencies
npm install

# Build all packages
npm run build
```

## Step 2: Install Reporter in Test Project (1 min)

```bash
# Navigate to your Playwright test project
cd /path/to/your/playwright/project

# Install reporter
npm install --save-dev playwright-dashboard-reporter
```

**Important:** No changes to `playwright.config.ts` needed! Dashboard adds reporter automatically.

## Step 3: Configure Dashboard (1 min)

```bash
# Back to dashboard directory
cd /path/to/yshvydak-test-dashboard

# Create .env file
cp .env.example .env
```

Edit `.env` and set your test project path:

```bash
# Required: Point to your test project
PLAYWRIGHT_PROJECT_DIR=/path/to/your/playwright/project

# Optional: Customize ports if needed
PORT=3001                    # API server port
VITE_BASE_URL=http://localhost:3001

# Authentication (for development)
ENABLE_AUTH=true
ADMIN_EMAIL=admin@admin.com
ADMIN_PASSWORD=qwe123
JWT_SECRET=dev-jwt-secret-change-in-production-12345
```

All other variables are automatically derived!

## Step 4: Start Dashboard (30 sec)

```bash
npm run dev
```

Dashboard opens at:
- **Web UI**: http://localhost:3000
- **API**: http://localhost:3001

## Step 5: Login & Discover Tests (30 sec)

1. Open http://localhost:3000 in your browser
2. Login with credentials from `.env`:
   - Email: `admin@admin.com`
   - Password: `qwe123`
3. Click **"Discover Tests"** button
4. Your tests appear in the dashboard!

## Step 6: Run Tests (any time)

### From Dashboard (Recommended)

- **Run All Tests** - Click button in Tests page
- **Run by File** - Click group header in Tests page
- **Rerun Failed** - Click rerun button next to any test

### From Command Line

Your existing test commands continue to work:

```bash
# Regular execution (uses your playwright.config.ts reporters)
npx playwright test

# Dashboard will show results when it runs tests via UI
```

---

## 🎉 You're Done!

Your dashboard is now:
- ✅ Monitoring test execution in real-time
- ✅ Tracking test history with attachments
- ✅ Ready for one-click reruns
- ✅ Storing results permanently

## Next Steps

### Customize Settings

Click your avatar → **Settings** to configure:
- **Theme**: Auto / Light / Dark modes
- **Test Execution**: Configure max workers
- **Admin Actions**: Discover tests, clear data, health check

### Explore Features

- **Dashboard**: View statistics, flaky tests, execution timeline
- **Tests Page**: Filter, search, group tests by file
- **Test Detail**: View attachments (videos, screenshots, traces), execution history
- **Rerun**: One-click rerun with real-time updates

### Production Deployment

For production deployment with CloudTunnel:
→ See [Deployment Guide](DEPLOYMENT.md)

---

## Troubleshooting

### Dashboard won't start

**Check port availability:**
```bash
# Check if port 3001 is already in use
lsof -i :3001

# Use different port
# In .env: PORT=8080
```

### Reporter not found

**Verify installation:**
```bash
cd /path/to/your/test/project
npm list playwright-dashboard-reporter
```

**If not found, install it:**
```bash
npm install --save-dev playwright-dashboard-reporter
```

### Tests not appearing

**Check `PLAYWRIGHT_PROJECT_DIR` path:**
```bash
# In dashboard directory
cat .env | grep PLAYWRIGHT_PROJECT_DIR

# Verify path exists
ls -la /path/from/env
```

**Run diagnostics:**
```bash
curl http://localhost:3001/api/tests/diagnostics
```

### Can't login

**Check authentication config in `.env`:**
```bash
ENABLE_AUTH=true
ADMIN_EMAIL=admin@admin.com
ADMIN_PASSWORD=qwe123
```

**Reset if needed:**
1. Stop dashboard (`Ctrl+C`)
2. Edit `.env` with correct credentials
3. Restart: `npm run dev`

---

## Need More Help?

- **Full Documentation**: [docs/README.md](README.md)
- **Reporter Setup**: [docs/REPORTER.md](REPORTER.md)
- **Configuration**: [docs/CONFIGURATION.md](CONFIGURATION.md)
- **Architecture**: [docs/ARCHITECTURE.md](ARCHITECTURE.md)

---

**Happy Testing! 🎭**

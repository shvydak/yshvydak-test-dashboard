# Dashboard Documentation

Welcome to the YShvydak Test Dashboard documentation. This guide helps you find the right documentation based on your role and needs.

## ⚡ 30-Second Context Checklist

Before diving into docs, know these 5 things:

1. **Backend**: Layered Architecture (Controller → Service → Repository → Database)
2. **Frontend**: Feature-Based + Atomic Design (`features/{name}/components/`)
3. **Reporter**: npm package `playwright-dashboard-reporter`, CLI injection, no config changes
4. **Database**: INSERT-only for test results (never UPDATE, preserves history)
5. **Attachments**: Permanent storage in `{OUTPUT_DIR}/attachments/` (survives Playwright cleanup)

✅ Now you're ready to navigate docs efficiently!

---

## 🚀 Quick Navigation

### For First-Time Users

1. **[Quick Start Guide](QUICKSTART.md)** - 5-minute setup guide
2. **[Reporter Setup](REPORTER.md)** - Install reporter in your test project
3. **[Configuration Guide](CONFIGURATION.md)** - Configure environment variables

### For Dashboard Developers

1. **[Architecture Overview](ARCHITECTURE.md)** - System design and patterns
2. **[Development Guide](DEVELOPMENT.md)** - Local development workflow
3. **[API Reference](API_REFERENCE.md)** - Complete API documentation
4. **[Testing Guide](../TESTING.md)** - Vitest commands, structure, coverage

### For DevOps / Deployment

1. **[Deployment Guide](DEPLOYMENT.md)** - CloudTunnel and production setup
2. **[Configuration Reference](CONFIGURATION.md)** - Environment management
3. **[Authentication Setup](features/AUTHENTICATION_IMPLEMENTATION.md)** - Security configuration

---

## 📚 Documentation by Topic

### Core System Documentation

| Document                                 | Description                                                            | When to Read                            |
| ---------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------- |
| **[ARCHITECTURE.md](ARCHITECTURE.md)**   | Complete system architecture, layered design, feature-based frontend   | Understanding how dashboard works       |
| **[REPORTER.md](REPORTER.md)**           | npm package integration, CLI-based injection, no config changes needed | Setting up test project integration     |
| **[CONFIGURATION.md](CONFIGURATION.md)** | 5-variable setup with auto-derivation, environment management          | Initial setup or changing configuration |
| **[API_REFERENCE.md](API_REFERENCE.md)** | REST endpoints, WebSocket events, request/response formats             | Building integrations or debugging API  |
| **[DEVELOPMENT.md](DEVELOPMENT.md)**     | Development commands, best practices, adding features                  | Contributing to dashboard development   |
| **[DEPLOYMENT.md](DEPLOYMENT.md)**       | CloudTunnel setup, production deployment, environment files            | Deploying to production                 |

### Feature Documentation

Feature-specific documentation for deep dives into individual capabilities:

| Feature                 | Document                                                                      | Description                                                           |
| ----------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Historical Tracking** | [HISTORICAL_TEST_TRACKING.md](features/HISTORICAL_TEST_TRACKING.md)           | Complete execution history with independent attachments per run       |
| **Attachment Storage**  | [PER_RUN_ATTACHMENTS.md](features/PER_RUN_ATTACHMENTS.md)                     | Permanent storage system that survives Playwright cleanup             |
| **Dashboard Redesign**  | [DASHBOARD_REDESIGN.md](features/DASHBOARD_REDESIGN.md)                       | Flaky test detection, timeline visualization, real-time updates       |
| **Settings Modal**      | [DASHBOARD_SETTINGS.md](features/DASHBOARD_SETTINGS.md)                       | Theme management (Auto/Light/Dark), centralized configuration         |
| **Rerun from Modal**    | [RERUN_FROM_MODAL.md](features/RERUN_FROM_MODAL.md)                           | One-click rerun with WebSocket updates, automatic execution switching |
| **Authentication**      | [AUTHENTICATION_IMPLEMENTATION.md](features/AUTHENTICATION_IMPLEMENTATION.md) | JWT-based security, automatic token expiry handling                   |

### AI-Assisted Development Documentation

Optimized documentation for Claude Code and AI assistants in vibe coding mode:

| Document                                         | Description                                          | When to Read         |
| ------------------------------------------------ | ---------------------------------------------------- | -------------------- |
| **[ai/README.md](ai/README.md)**                 | AI documentation index and usage guide               | Overview of AI docs  |
| **[ai/ANTI_PATTERNS.md](ai/ANTI_PATTERNS.md)**   | Common mistakes with code examples (wrong vs. right) | When coding          |
| **[ai/FILE_LOCATIONS.md](ai/FILE_LOCATIONS.md)** | Complete file structure with quick find examples     | When searching       |
| **[ai/CONCEPT_MAP.md](ai/CONCEPT_MAP.md)**       | Visual flows and dependency relationships            | Understanding system |

**Total:** ~1,200 lines of AI-specific context | **Token efficient:** Modular loading on demand

---

## 🎯 Common Tasks

### I want to...

**Setup the dashboard for the first time**
→ Read: [Quick Start](QUICKSTART.md) → [Configuration](CONFIGURATION.md)

**Integrate with my Playwright tests**
→ Read: [Reporter Setup](REPORTER.md) → Install `playwright-dashboard-reporter`

**Run tests from the dashboard**
→ Dashboard handles everything automatically via CLI flag injection

**Understand the architecture**
→ Read: [Architecture](ARCHITECTURE.md) → Focus on Layered Architecture (backend) and Feature-Based (frontend)

**Add a new feature**
→ Read: [Development Guide](DEVELOPMENT.md) → Follow Feature-Based Architecture pattern

**Deploy to production**
→ Read: [Deployment Guide](DEPLOYMENT.md) → Setup CloudTunnel

**Debug integration issues**
→ Read: [Reporter Troubleshooting](REPORTER.md#troubleshooting) → Check diagnostics endpoint

**Work with test attachments**
→ Read: [Attachment Storage](features/PER_RUN_ATTACHMENTS.md) → Understand permanent storage

**View test execution history**
→ Read: [Historical Tracking](features/HISTORICAL_TEST_TRACKING.md) → ExecutionSidebar feature

---

## 🔍 Documentation Status

### ✅ Current & Accurate

- QUICKSTART.md - 5-minute setup guide
- ARCHITECTURE.md - Complete system design
- REPORTER.md - npm package integration (updated October 2025)
- API_REFERENCE.md - All endpoints documented
- Feature docs - All feature documentation current

### 📦 Archived (Historical Reference)

Older documentation moved to `archive/` folder:

- CODE_OPTIMIZATION.md - Production optimization notes (completed)
- TIMESTAMP_MANAGEMENT.md - Timestamp architecture (integrated into main docs)
- TEST_DISPLAY.md - Test count consistency (issue resolved)
- SIMPLIFIED_ENV_CONFIGURATION.md - Merged into CONFIGURATION.md

---

## 📖 Reading Guide by Experience Level

### Beginner (First Time Setup)

1. Quick Start Guide
2. Reporter Setup
3. Configuration Guide
4. Try running tests!

### Intermediate (Regular Use)

1. Architecture Overview (skim)
2. Development Guide
3. API Reference (as needed)
4. Feature docs (for specific features)

### Advanced (Contributing)

1. Architecture (deep read)
2. Development Guidelines
3. Feature documentation (all)
4. Deployment guide

---

## 🆘 Getting Help

### Troubleshooting Steps

1. Check [REPORTER.md Troubleshooting](REPORTER.md#troubleshooting)
2. Run diagnostics: `curl http://localhost:3001/api/tests/diagnostics`
3. Verify configuration in `.env` file
4. Check [Common Issues in CLAUDE.md](../CLAUDE.md#-common-issues--quick-fixes)

### For Dashboard Developers

- **Main Entry Point**: [CLAUDE.md](../CLAUDE.md) - Quick reference for AI development
- **Architecture Details**: [ARCHITECTURE.md](ARCHITECTURE.md)
- **Development Commands**: [DEVELOPMENT.md](DEVELOPMENT.md)

---

## 📝 Documentation Principles

Our documentation follows these principles:

1. **Minimal Duplication** - One source of truth for each topic
2. **Role-Based Organization** - Easy to find docs for your role
3. **Practical Examples** - Real-world usage patterns
4. **Always Current** - Updated with code changes
5. **Progressive Disclosure** - Start simple, go deep as needed

---

**Last Updated:** October 2025
**Maintained by:** Yurii Shvydak
**For quick AI reference:** See [CLAUDE.md](../CLAUDE.md)

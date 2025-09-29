# Debugging Methodology

This document defines the systematic debugging approach for the YShvydak Test Dashboard. The methodology focuses on multi-layer analysis and standard setup procedures.

## Core Debugging Principles

### 1. Clean Diagnostic Environment

-   Each debug session starts with a fresh browser (no cookies, cache, localStorage)
-   Clean environment ensures debugging replicates actual user experience
-   No interference from previous states or cached data

### 2. Multi-layer Analysis

-   **Frontend Layer**: Browser console, network requests, DOM state, JavaScript execution
-   **Backend Layer**: Server logs, database state, API responses, process health
-   **Integration Layer**: Data flow correlation, WebSocket events, external system communication
-   Simultaneous analysis across all relevant system layers

### 3. Symptom-based Approach

-   User provides symptom description without prescribing solution approach
-   Claude determines appropriate diagnostic scope and methodology autonomously
-   Evidence-based conclusions from observed system behavior

## Standard Debug Setup

### Prerequisites for Any Debug Session

1. **Server Health Check**

    ```bash
    npm run dev                              # Start all development servers
    lsof -i :3000 -i :3001                  # Verify port availability
    curl http://localhost:3001/api/health    # API health verification
    ```

2. **Clean Browser Environment**

    - Open fresh browser session → navigate to localhost:3000 (or fallback port)
    - Login with provided credentials → verify dashboard access
    - Confirm WebSocket connection establishment

3. **Diagnostic Monitoring Activation**
    - Enable console message monitoring
    - Activate network request tracking
    - Prepare server log observation

## Diagnostic Tools Matrix

### Frontend Diagnostic Tools

```javascript
mcp__playwright__browser_console_messages // JavaScript errors, debug output
mcp__playwright__browser_network_requests // HTTP requests, WebSocket traffic
mcp__playwright__browser_evaluate // JavaScript execution, variable inspection
mcp__playwright__browser_snapshot // DOM state, accessibility tree
mcp__playwright__browser_take_screenshot // Visual state verification
```

### Backend Diagnostic Tools

```bash
BashOutput monitoring                        # Real-time server log analysis
curl API endpoint testing                   # Direct API verification
Process health checking                      # Server status and performance
```

### Integration Diagnostic Capabilities

-   Data flow correlation between frontend and backend
-   WebSocket event tracking and timing analysis
-   External system integration monitoring

## System Access Points

### URLs & Credentials

-   **Web Interface**: `http://localhost:3000` (primary) or `http://localhost:3002` (fallback)
-   **API Base**: `http://localhost:3001`
-   **Health Check**: `http://localhost:3001/api/health`

### External Dependencies

-   **Reporter Location**: `/Users/y.shvydak/QA/probuild-qa/e2e/testUtils/yshvydakReporter.ts`
-   **Test Project**: Configured via `PLAYWRIGHT_PROJECT_DIR` environment variable

---

**Usage**: User describes symptom → Claude executes standard setup → Performs focused multi-layer analysis → Provides diagnostic findings with evidence.

## Key Features

### Real-Time Process State Management

**Problem:** After starting tests, dashboard buttons get locked, but sometimes remain locked even after tests finish (especially after refreshing the page).

**How It Works (in simple words):**

1. **When tests start:**
    - The Playwright reporter notifies the server: _“Hey, I’m starting tests!”_
    - The server records: _“Process X is running”_
    - The dashboard receives the signal and locks the buttons

2. **When tests finish:**
    - The reporter notifies the server: _“I’m done!”_
    - The server clears this process: _“Process X ended”_
    - The dashboard receives the signal and unlocks the buttons

3. **On page refresh:**
    - The dashboard asks the server: _“Which processes are running right now?”_
    - The server answers based on actual runtime state (not database)
    - Buttons are locked **only if** tests are really running

**Smart Features:**

- **Auto-Cleanup:** Server automatically clears old processes (after 5+ minutes)
- **Emergency Reset Button:** If something goes wrong, buttons can be force-unlocked
- **Source of Truth:** The system does not rely on the database but tracks real active processes

**For Users:** Buttons always reflect the real state. If they ever get stuck, there’s a handy **“🚨 Force Reset Server Processes”** button.

**For Developers:** Core logic lives in `ActiveProcessesTracker` + WebSocket events:  
`connection:status`, `process:started`, `process:ended`.

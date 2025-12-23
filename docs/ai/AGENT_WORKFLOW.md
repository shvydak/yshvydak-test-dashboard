# Agent-Based Workflow Guide

Quick reference for the new agent-based vibe coding workflow.

---

## 🎯 Complete Workflow Overview

```
┌─────────────────────────────────────────────────────────────┐
│ 1️⃣ RESEARCH PHASE (Parallel Explore Agents)                │
│    • Find similar implementations                           │
│    • Locate dependencies                                    │
│    • Verify architecture compliance                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2️⃣ PLANNING & DEVELOPMENT                                  │
│    • Present plan to user                                   │
│    • Ask only critical questions                            │
│    • Implement following Repository Pattern                 │
│    • Track progress with TodoWrite                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3️⃣ TEST GAP DETECTION (Proactive)                          │
│    • Check for missing tests                                │
│    • Suggest tests for new methods/endpoints/components     │
│    • Verify edge cases covered                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4️⃣ AGENT VALIDATION PHASE (Parallel Agents)                │
│    ┌───────────────────────────────────────────────────┐   │
│    │ validation-agent                                  │   │
│    │ • format, type-check, lint, test, build         │   │
│    └───────────────────────────────────────────────────┘   │
│    ┌───────────────────────────────────────────────────┐   │
│    │ coverage-agent                                    │   │
│    │ • Test coverage analysis                         │   │
│    │ • Gap detection & suggestions                    │   │
│    └───────────────────────────────────────────────────┘   │
│    ┌───────────────────────────────────────────────────┐   │
│    │ documentation-agent                               │   │
│    │ • Check DOCUMENTATION_UPDATE_RULES.md            │   │
│    │ • Context7-MCP for dependencies                  │   │
│    └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5️⃣ ARCHITECTURE REVIEW (Final Check)                       │
│    • Dead code detection                                    │
│    • Duplicate logic detection                              │
│    • Repository Pattern compliance                          │
│    • Test ID generation consistency (CRITICAL)              │
│    • Best practices verification                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    ✅ Ready to Commit!
```

---

## 📦 Available Agents

### Core Validation Agents

#### `@validation-agent`
**What it does:**
- Runs: `npm run format`, `npm run type-check`, `npm run lint:fix`, `npm test`, `npm run build`
- Reports concise summary (not full logs)
- Offers to fix errors automatically

**When to use:**
- ✅ Every task (required)
- ✅ Before commit

**Example output:**
```
✅ Validation Complete
  ✅ format - Passed
  ✅ type-check - Passed
  ✅ lint:fix - Passed (fixed 2 issues)
  ✅ test - Passed (1,274 tests)
  ✅ build - Passed
```

---

#### `@coverage-agent`
**What it does:**
- Runs `npm run test:coverage`
- Compares against targets (Reporter: 90%, Server: 80%, Web: 70%)
- Identifies specific gaps with line numbers
- Suggests tests to write

**When to use:**
- ✅ New features
- ✅ New service methods
- ⚠️ Optional for bug fixes
- ❌ Skip for UI-only changes

**Example output:**
```
📊 Coverage Analysis Complete

⚠️ Server Package: 76.4% (need 80%+)

Gaps:
  packages/server/src/services/csv-export.service.ts
  Coverage: 45.2%
  Missing:
    Lines 42-56: generateReport() method
    Lines 89-94: validateColumns() method

Shall I help write these tests? (yes/no)
```

---

#### `@documentation-agent`
**What it does:**
- Reads `DOCUMENTATION_UPDATE_RULES.md`
- Detects what docs need updating (P0/P1/P2)
- Checks Context7-MCP for dependency changes (MANDATORY)
- Offers to update docs automatically

**When to use:**
- ✅ New features
- ✅ API changes
- ✅ Dependency changes (CRITICAL)
- ⚠️ If API changed during refactoring
- ❌ Skip for bug fixes/UI changes

**Example output:**
```
📝 Documentation Agent Report

P1 (High Priority):
  1. docs/API_REFERENCE.md
     Reason: New endpoint POST /api/tests/export-csv

P2 (Medium Priority):
  2. docs/features/CSV_EXPORT.md (new file)
     Reason: Significant user-facing feature

Update now? (yes/no/later)
```

---

#### `@architecture-review-agent`
**What it does:**
- Detects dead code (unused imports, functions, commented code)
- Detects duplicated logic (copy-paste patterns)
- Verifies Repository Pattern compliance
- Checks Test ID generation consistency (CRITICAL)
- Validates best practices

**When to use:**
- ✅ New features
- ✅ Refactoring
- ✅ Significant bug fixes
- ❌ Skip for trivial fixes/docs-only

**Example output:**
```
🏗️ Architecture Review Complete

Status: ⚠️ Issues Found

Critical: 1
  • Repository Pattern violation (csv-export.service.ts:45)

Warnings: 3
  • Duplicated WebSocket URL logic (3 files)
  • Dead code: 2 unused imports
  • Generic error message

Good Practices: 4
  ✓ DRY principle followed
  ✓ Test ID generation consistent

Fix issues? (yes/no/selective)
```

---

## 🚀 Usage Patterns

### Pattern 1: New Feature (Full Workflow)

```bash
@vibe add CSV export feature
```

**Vibe will automatically:**
1. ✅ Research with Explore agents (parallel)
2. ✅ Present plan
3. ✅ Implement code
4. ✅ Check for test gaps → suggest adding tests
5. ✅ Recommend all 3 agents: validation + coverage + documentation
6. ✅ Run agents in parallel
7. ✅ Consolidate results
8. ✅ Suggest architecture review
9. ✅ Fix any issues found

**Your interaction:**
```
Vibe: Run all agents now? (yes/no/skip/customize)
You: yes

[Agents run in parallel]

Vibe: 📊 Agent Results
      ✅ Validation passed
      ⚠️ Coverage at 78% (need 80%+)
      📝 Docs need update

      Fix coverage gap? (yes/no)
You: yes

Vibe: [Writes tests]
      ✅ Coverage now 82%!

      Update documentation? (yes/no)
You: yes

Vibe: ✅ Docs updated!

      Run architecture review? (yes/no)
You: yes

Vibe: ✅ All checks passed! Ready to commit.
```

---

### Pattern 2: Bug Fix (Simplified)

```bash
@vibe fix attachment download bug
```

**Vibe will automatically:**
1. ✅ Fix the bug
2. ✅ Recommend only validation-agent (skip coverage/docs)

**Your interaction:**
```
Vibe: Task type detected: Bug Fix

      Recommended agents:
        ✅ validation-agent (Required)
        ⚠️ coverage-agent (Optional)
        ❌ documentation-agent (Skip)

      Run validation-agent? (yes/no)
You: yes

Vibe: ✅ Validation passed!
      ✅ Done!
```

---

### Pattern 3: Manual Control

```bash
@vibe refactor TestService
```

**Your interaction:**
```
Vibe: Run all agents now? (yes/no/skip/customize)
You: customize

Vibe: Which agents? (validation,coverage,documentation or all/none)
You: validation,coverage

Vibe: [Runs only validation + coverage]
      ✅ Both passed!
```

---

### Pattern 4: Run Agents Manually

If you want to run agents independently:

```bash
# Run only validation
@validation-agent

# Run only coverage
@coverage-agent

# Run only documentation check
@documentation-agent

# Run architecture review
@architecture-review-agent

# Or combine
@validation-agent @coverage-agent
```

---

## ⏱️ Performance Improvements

| Aspect | Before (inline) | After (agents) | Improvement |
|--------|-----------------|----------------|-------------|
| **Speed** | 6-8 min (sequential) | 2-3 min (parallel) | **2.5-3x faster** |
| **Tokens** | ~13,000 per task | ~500 per task | **95% reduction** |
| **Context** | Cluttered with logs | Clean summaries | **Much cleaner** |
| **Flexibility** | All or nothing | Smart recommendations | **More flexible** |

---

## 🎯 Smart Agent Recommendations

Vibe automatically detects task type and recommends appropriate agents:

| Task Type | validation | coverage | documentation | Example |
|-----------|-----------|----------|---------------|---------|
| **New Feature** | ✅ Required | ✅ Required | ✅ Required | Add CSV export |
| **Bug Fix** | ✅ Required | ⚠️ Optional | ❌ Skip | Fix download bug |
| **Refactoring** | ✅ Required | ⚠️ Optional | ⚠️ If API changed | Restructure services |
| **UI Changes** | ✅ Required | ❌ Skip | ❌ Skip | Update button styles |
| **Tests** | ✅ Required | ✅ Required | ❌ Skip | Add unit tests |
| **Documentation** | ❌ Skip | ❌ Skip | ❌ Skip | Update README |

---

## 🔧 Configuration

All agents are defined in:
```
.claude/agents/
├── vibe.md                        # Main workflow orchestrator
├── validation-agent.md            # Code validation
├── coverage-agent.md              # Test coverage analysis
├── documentation-agent.md         # Documentation checks
└── architecture-review-agent.md   # Architecture & quality review
```

---

## 💡 Best Practices

### ✅ DO:
- Say "yes" to agent suggestions (they're optimized for your workflow)
- Run architecture review for non-trivial changes
- Let agents fix issues automatically (they know the patterns)
- Use "customize" if you know exactly what you need

### ❌ DON'T:
- Skip validation-agent (it's always required)
- Skip architecture review for new features
- Say "no" to test gap detection (fix it early)
- Manually run commands when agents can do it (slower + more tokens)

---

## 🐛 Troubleshooting

**Q: Agent failed or timed out?**
A: Vibe has fallback - it will run commands manually in main chat.

**Q: Want to skip agents completely?**
A: Say "no" when vibe asks. It will run validation manually (old way).

**Q: Agent found issue I disagree with?**
A: Use "selective" option to choose which fixes to apply.

**Q: How do I see full logs?**
A: Agents show summaries. For full logs, run commands manually:
```bash
npm test
npm run type-check
```

---

## 📊 Typical Session Timeline

**New Feature (~5-7 minutes total):**
```
0:00 - User: @vibe add CSV export
0:30 - Vibe: Research complete (parallel agents)
1:00 - Vibe: Plan presented
1:30 - User: Approves plan
2:00 - Vibe: Development complete
2:30 - Vibe: Test gap check → suggests tests
3:00 - User: Adds tests
3:30 - Vibe: Launches agents (parallel)
5:30 - Agents: All complete (validation + coverage + docs)
6:00 - Vibe: Architecture review suggested
6:30 - Review: Complete, no issues
7:00 - ✅ Ready to commit!
```

**Bug Fix (~3-4 minutes total):**
```
0:00 - User: @vibe fix bug
1:00 - Vibe: Bug fixed
1:30 - Vibe: Recommends validation-agent only
2:00 - validation-agent: Running
3:30 - ✅ All checks passed, ready to commit!
```

---

## 🎓 Learning Curve

**Day 1:** Just say "yes" to everything vibe suggests
**Week 1:** Understand which agents are needed for what
**Week 2:** Use "customize" for specific scenarios
**Week 3:** Master the full workflow, maximum efficiency

---

## 📚 Related Documentation

- [vibe.md](../../.claude/agents/vibe.md) - Full workflow specification
- [DOCUMENTATION_UPDATE_RULES.md](DOCUMENTATION_UPDATE_RULES.md) - Doc update rules
- [CLAUDE.md](../../CLAUDE.md) - Project architecture quick reference

---

**Last Updated:** January 2025
**Workflow Version:** 2.0 (Agent-based)

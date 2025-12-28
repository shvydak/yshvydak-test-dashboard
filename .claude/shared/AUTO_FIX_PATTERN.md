# Auto-Fix Pattern Standard

Standard approach for agents to handle automatic fixes.

---

## Decision Flow

```
Issues Found
    ↓
Present Summary
    ↓
Ask: Fix? (yes/no/selective/later)
    ↓
┌─────────┬─────────────┬────────────┬──────────┐
│   yes   │ selective   │     no     │  later   │
├─────────┼─────────────┼────────────┼──────────┤
│ Fix All │ Ask Which   │ Skip All   │ Postpone │
│ Auto    │ Fix Chosen  │            │          │
└─────────┴─────────────┴────────────┴──────────┘
    ↓           ↓             ↓            ↓
Report      Report      Continue     Set Flag
Success     Success                  (remind)
```

---

## Implementation Pattern

### Step 1: Present Issues

Always show:

1. **Summary** - Count of issues by severity
2. **Top 3 priorities** - Most critical issues first
3. **Impact** - What happens if not fixed
4. **Recommendation** - Specific action to take

```markdown
⚠️ [Count] Issues Found

Priority Breakdown:
🔴 Critical: [N] (must fix)
🟡 Warning: [N] (should fix)
🟢 Info: [N] (nice to have)

Top 3 Priorities:

1. [Issue description with location]
   Impact: [What breaks/degrades]
   Fix: [Specific action]

2. [Issue description with location]
   Impact: [What breaks/degrades]
   Fix: [Specific action]

3. [Issue description with location]
   Impact: [What breaks/degrades]
   Fix: [Specific action]

Fix issues? (yes/no/selective/later)
```

---

### Step 2: Handle "yes" (Fix All)

```markdown
🔧 Applying fixes...

1. ✅ Fixed [Issue 1 description]
   [Brief summary of what was changed]

2. ✅ Fixed [Issue 2 description]
   [Brief summary of what was changed]

3. ✅ Fixed [Issue 3 description]
   [Brief summary of what was changed]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All issues fixed! Re-running validation...

[Optional: Trigger validation to ensure fixes work]
```

**Actions:**

1. Apply fixes sequentially
2. Report progress for each fix
3. Show summary when complete
4. Optional: Re-run validation

---

### Step 3: Handle "selective"

```markdown
Which issues to fix? (enter numbers, e.g., "1,3,4")

1. [Issue 1 - Critical]
2. [Issue 2 - Warning]
3. [Issue 3 - Warning]
4. [Issue 4 - Info]

Your choice:
```

**After user responds:**

```markdown
🔧 Applying selected fixes (1, 3)...

1. ✅ Fixed [Issue 1]
2. ✅ Fixed [Issue 3]

Skipped: 2. [Issue 2 - can fix later] 4. [Issue 4 - can fix later]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Selected fixes applied!
```

---

### Step 4: Handle "no" (Skip All)

```markdown
👍 Skipping all fixes

Note: These issues may cause problems:
🔴 Critical issues: [N] (strongly recommend fixing)
🟡 Warnings: [N] (fix when convenient)

You can run this check again anytime.
```

**Don't:**

- Be pushy ("Are you sure?")
- Re-ask multiple times
- Show disappointment

**Do:**

- Respect user's decision
- Note consequences if critical
- Offer to check again later

---

### Step 5: Handle "later"

```markdown
👍 Fixes postponed

Pending issues:
🔴 Critical: [N]
🟡 Warning: [N]
🟢 Info: [N]

I'll remind you before git operations (commit/push).

Reminder will include:

- [Issue 1 summary]
- [Issue 2 summary]
- [Issue 3 summary]
```

**Actions:**

1. Set flag to remind before git operations
2. Store issue summary for reminder
3. Don't nag during development

---

## Fix Safety Rules

### ✅ Safe to Auto-Fix:

1. **Formatting issues**
    - Prettier formatting
    - Semicolons, quotes
    - Indentation

2. **Import cleanup**
    - Remove unused imports
    - Sort imports

3. **Lint auto-fixes**
    - `eslint --fix` issues
    - Simple rule violations

4. **Dead code removal**
    - Unused variables
    - Unreachable code
    - Commented-out code

### ⚠️ Ask Before Fixing:

1. **Logic changes**
    - Repository Pattern violations
    - Algorithm changes
    - Error handling

2. **Structural changes**
    - File moves
    - Refactoring
    - Architecture changes

3. **Breaking changes**
    - API contract changes
    - Database schema
    - Test ID generation

### ❌ NEVER Auto-Fix:

1. **User code logic**
    - Business logic
    - Feature implementation
    - Complex algorithms

2. **Critical systems**
    - Authentication
    - Database migrations
    - Test ID generation

3. **External dependencies**
    - package.json changes
    - Config files (ask first)

---

## Error Handling During Fixes

If a fix fails:

```markdown
❌ Fix Failed

Issue: [Description]
Error: [Error message]

Attempted fix:
[What was tried]

Reason for failure:
[Why it failed]

Recommendation:
[Manual fix steps OR alternative approach]

Continue with remaining fixes? (yes/no)
```

**Don't:**

- Silently skip failed fixes
- Try the same fix multiple times
- Give up on all fixes

**Do:**

- Report failure clearly
- Explain what went wrong
- Offer alternatives
- Ask if should continue

---

## Progress Reporting

For long fix operations (>5 fixes):

```markdown
🔧 Applying fixes (15 total)...

Progress: ▓▓▓▓▓▓▓░░░░░░░░ 7/15 (47%)

Current: Fixing duplicated WebSocket logic in 3 files...
```

**Update every:**

- 25% progress
- After each major fix
- Before long-running operations

---

**Used by:**

- validation-agent.md (fixing lint/test errors)
- coverage-agent.md (writing missing tests)
- documentation-agent.md (updating docs)
- architecture-review-agent.md (fixing violations)

# Agent Output Format Standard

All agents follow this consistent format for reporting results.

---

## Status Indicators

- ✅ **Success** - Operation completed successfully, all checks passed
- ❌ **Failure** - Critical issues found, must be fixed
- ⚠️ **Warning** - Non-critical issues found, should be reviewed
- ℹ️ **Info** - Informational message, no action needed

---

## Report Structure

Every agent report MUST follow this structure:

```
[EMOJI] [Agent Name] Report

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Status Summary - one line]

[Detailed Findings - if any issues]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Action Question]
```

### Example (Success):

```
✅ Validation Agent Report

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All checks passed ✅

Format:     ✅ Passed (0.8s)
Type-check: ✅ Passed (2.1s)
Lint:       ✅ Passed (1.5s)
Tests:      ✅ Passed (12.3s) - 1,274 tests
Build:      ✅ Passed (8.7s)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total time: 25.4s
Ready to commit!
```

### Example (Issues Found):

```
⚠️ Coverage Agent Report

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Coverage gaps detected in 1 package:

┌─────────────┬───────────┬────────┬──────────┐
│ Package     │ Coverage  │ Target │ Status   │
├─────────────┼───────────┼────────┼──────────┤
│ Reporter    │   92.3%   │  90%+  │    ✅    │
│ Server      │   76.4%   │  80%+  │    ⚠️    │
│ Web         │   74.5%   │  70%+  │    ✅    │
└─────────────┴───────────┴────────┴──────────┘

Server Package (76.4% - need 80%+):
  Gap: -3.6% (need ~150 lines)

Top 3 uncovered files:
  1. csv-export.service.ts (45.2%)
  2. notification.service.ts (62.1%)
  3. export.repository.ts (58.3%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Recommendations:
  Priority 1: Add tests for CsvExportService.generateReport()
  Priority 2: Add error handling tests
  Priority 3: Add NotificationService.sendEmail() tests

Write these tests? (yes/no/later)
```

---

## Action Questions

Always end reports with a clear action question using one of these formats:

### Standard Options:

- `(yes/no)` - Binary choice
- `(yes/no/later)` - Can postpone decision
- `(yes/no/skip)` - Can skip permanently

### Multi-Choice Options:

- `(yes/no/selective)` - Can choose which issues to fix
- `(1/2/3)` - Numbered options
- `(yes/update-version/cancel)` - Custom options

### Examples:

```markdown
Fix all issues? (yes/no/selective)
```

```markdown
Update now? (yes/no/later)
```

```markdown
What would you like to do? (1/2/3)

1. Revert to identical algorithm
2. Create migration guide
3. Cancel changes
```

---

## Conciseness Rules

### ✅ DO:

- Keep status line under 100 characters
- Use tables for structured data
- Show top 3 priorities max (offer "show more")
- Use separators (━━━━) to divide sections
- End with clear action question

### ❌ DON'T:

- Include raw command output (summarize instead)
- Show more than 5 detailed items without pagination
- Overwhelm with information (prioritize critical issues)
- Use vague language ("some issues found" - be specific)

---

**Used by:**

- validation-agent.md
- coverage-agent.md
- documentation-agent.md
- architecture-review-agent.md

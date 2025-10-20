# Documentation Update Rules (for AI)

Quick rules for AI assistants to know when to proactively suggest documentation updates.

---

## 🎯 Proactive Suggestion Triggers

When you see these changes in code, **proactively suggest** updating docs:

### ✅ ALWAYS Suggest (High Priority)

| Code Change | Suggest Update | Example |
|-------------|----------------|---------|
| **New REST endpoint** | docs/API_REFERENCE.md | `router.get('/api/tests/export')` |
| **New WebSocket event** | docs/API_REFERENCE.md | `socket.emit('test:exported')` |
| **API contract change** | docs/API_REFERENCE.md | Changed request/response format |
| **Files moved** | docs/ai/FILE_LOCATIONS.md | `mv controllers/ api/v2/controllers/` |
| **New architecture layer** | docs/ARCHITECTURE.md + CLAUDE.md | New middleware layer added |
| **Breaking change** | All relevant docs + migration guide | testId algorithm changed |

### ⚠️ MAYBE Suggest (Medium Priority)

| Code Change | Suggest Update | When |
|-------------|----------------|------|
| **New feature** | docs/features/NEW_FEATURE.md | Significant user-facing functionality |
| **Repeated mistake** | docs/ai/ANTI_PATTERNS.md | Seen same bug/pattern 2+ times |
| **New env variable** | docs/CONFIGURATION.md | Added to `.env.example` |
| **New key component** | docs/ai/FILE_LOCATIONS.md | New important service/controller |

### ❌ DON'T Suggest (Low Priority)

| Code Change | Reason |
|-------------|--------|
| **Bug fix (internal)** | Doesn't change architecture or API |
| **UI styling** | Not architectural |
| **Refactoring (internal)** | Public API unchanged |
| **Dependency update** | No functionality change |
| **Typo fixes** | Trivial |

---

## 📝 Suggestion Template

When suggesting documentation update, use this format:

```
✅ Changes complete!

📝 Documentation recommendation:
   Update: docs/API_REFERENCE.md
   Reason: New public endpoint GET /api/tests/export

   Shall I update the documentation now? (yes/no/later)
```

**If user says "yes":**
- Update the document immediately
- Confirm: "✅ Updated docs/API_REFERENCE.md"

**If user says "no":**
- Acknowledge: "👍 Skipping documentation update"
- Don't ask again for this change

**If user says "later":**
- Acknowledge: "👍 I'll remind you before committing"
- Remind when user mentions "commit", "pr", or "push"

---

## 🔍 Detection Patterns

### REST Endpoint Detection
```typescript
// Pattern: router.{method}('/api/...')
router.get('/api/tests/export')
router.post('/api/tests/:id/rerun')
app.use('/api/v2', routes)
```
→ **Suggest:** Update docs/API_REFERENCE.md

### WebSocket Event Detection
```typescript
// Pattern: socket.emit('event:name')
socket.emit('test:completed', data)
this.broadcast('dashboard:refresh')
```
→ **Suggest:** Update docs/API_REFERENCE.md

### File Movement Detection
```bash
# Pattern: mv, git mv, or file path changes
git mv src/controllers src/api/v2/controllers
```
→ **Suggest:** Update docs/ai/FILE_LOCATIONS.md

### Breaking Change Detection
```typescript
// Pattern: Comments with "BREAKING", version bump, algorithm change
// BREAKING CHANGE: testId now includes line number
generateTestId(file, title, line)  // was: generateTestId(file, title)
```
→ **Suggest:** Update ALL relevant docs + migration guide

### New Feature Detection
```typescript
// Pattern: New feature flag, new route group, new settings
features: {
    exportToCSV: true  // NEW feature
}
```
→ **Suggest:** Consider creating docs/features/EXPORT_TO_CSV.md

---

## 🎯 Priority Levels

**P0 (Critical):** Breaking changes
- Suggest immediately
- Insist on update before commit

**P1 (High):** Public API changes
- Suggest immediately
- Allow "later" option

**P2 (Medium):** New features, file movements
- Suggest at end of session
- Easy to decline

**P3 (Low):** Nice to have
- Only suggest if user asks "should I update docs?"
- Don't suggest proactively

---

## 💡 Best Practices for AI

### DO:
- ✅ Suggest updates **at the end** of implementation (not during)
- ✅ Be specific: "Update docs/API_REFERENCE.md section 'Test Endpoints'"
- ✅ Offer to do it: "Shall I update now?"
- ✅ Respect user's choice (yes/no/later)

### DON'T:
- ❌ Interrupt during coding with doc suggestions
- ❌ Suggest for trivial changes
- ❌ Insist if user says "no" (unless P0 breaking change)
- ❌ Ask multiple times for same change

---

## 🔄 Workflow Example

```
User: "Add CSV export endpoint"
  ↓
[AI implements feature]
  ↓
[Feature complete, tests pass]
  ↓
AI: "✅ CSV export endpoint complete!

     📝 Recommendation: Update docs/API_REFERENCE.md
     (new endpoint GET /api/tests/export)

     Update now? (yes/no/later)"
  ↓
User: "yes"
  ↓
AI: [Updates docs/API_REFERENCE.md]
    "✅ Documentation updated"
```

---

## 📊 When to Update Which Doc

Quick reference:

| Doc | When | Example |
|-----|------|---------|
| **CLAUDE.md** | Rarely (critical concepts only) | New top-3 anti-pattern |
| **docs/ai/ANTI_PATTERNS.md** | When pattern seen 2+ times | Common mistake found |
| **docs/ai/FILE_LOCATIONS.md** | Files moved or new key component | Moved controllers/ |
| **docs/ai/CONCEPT_MAP.md** | Data flow changed | New WebSocket event |
| **docs/API_REFERENCE.md** | API changes | New endpoint |
| **docs/ARCHITECTURE.md** | New architectural pattern | Added caching layer |
| **docs/CONFIGURATION.md** | New env variable | Added SMTP_HOST |
| **docs/features/** | New significant feature | Dashboard export |

---

**For AI:** Use this guide to be helpful but not annoying. Suggest when it matters, stay quiet when it doesn't.

**Last Updated:** October 2025

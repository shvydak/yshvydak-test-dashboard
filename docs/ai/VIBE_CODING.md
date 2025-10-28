# Vibe Coding Workflow

Quick guide for productive feature development with Claude Code custom agent.

---

## 🚀 Quick Start

In any Claude Code chat, simply type:

```
@vibe <what you want to develop>
```

The agent will automatically execute your complete development workflow.

---

## 📋 Examples

### New Feature

```
@vibe add bulk test rerun (выбрать несколько тестов и перезапустить)
@vibe add CSV export для тестов
@vibe add email notifications для failed tests
@vibe add фильтрацию по статусу тестов
```

### Refactoring

```
@vibe вынести WebSocket логику в отдельный хук
@vibe рефакторинг TestService для оптимизации
@vibe переместить utility functions в shared package
```

### Bug Fixes

```
@vibe исправить attachments не работают после rerun
@vibe исправить WebSocket disconnects при long running tests
@vibe исправить flaky detection не срабатывает
```

### Enhancements

```
@vibe оптимизировать загрузку dashboard (lazy loading)
@vibe улучшить error handling в API endpoints
@vibe добавить loading states для test execution
```

---

## 🔄 What the Agent Does

The `@vibe` agent executes a complete 6-phase workflow:

### 1️⃣ Research Phase (30 sec - 2 min)

**Agent automatically launches 2-3 Explore/General agents in parallel:**

- Finds similar feature implementations
- Locates all dependencies
- Verifies architecture compliance

**You see:**

```
🔍 Researching... (Explore agents: medium thoroughness)
```

### 2️⃣ Understanding & Questions

**Agent presents findings:**

```
✅ Research complete!

Found:
- [Summary of existing implementation]
- [Dependencies identified]
- [Architecture patterns]

Plan:
1. Backend: Controller → Service → Repository
2. Frontend: Components in features/
3. Tests: Unit + Integration
4. Documentation: API_REFERENCE.md

Questions (only critical ones):
- [Question if ambiguity exists]

Ready to start? (yes/use defaults)
```

**What you do:**

- Type `yes` to proceed with plan
- Type `use defaults` to proceed with recommended defaults
- Answer questions if any

### 3️⃣ Development Phase

**Agent develops following:**

- ✅ Repository Pattern (Controller → Service → Repository)
- ✅ Feature-based structure (frontend)
- ✅ Best practices
- ✅ Existing utility reuse

**You see:**

```
📋 Todo List:
✅ Research complete
🔄 Implement backend (Repository Pattern)
⏳ Implement frontend
⏳ Write/update tests
⏳ Run validation checklist
⏳ Check test coverage
⏳ Check documentation updates
```

### 4️⃣ Validation Phase (Automatic)

**Agent runs ALL checks:**

```bash
npm run format        # ✨ Prettier
npm run type-check    # 🔍 TypeScript
npm run lint:fix      # 🎨 ESLint
npm test              # ✅ Tests
npm run build         # 📦 Build
```

**You see:**

```
🧪 Running validation checklist...
✅ format - Passed
✅ type-check - Passed
✅ lint:fix - Passed
✅ test - Passed (1,274 tests)
✅ build - Passed

All validation checks passed!
```

### 5️⃣ Test Coverage Check

**Agent analyzes:**

- New service methods have tests?
- New API endpoints have integration tests?
- UI components have tests?
- Coverage targets met?

**You see (if gaps found):**

```
⚠️ Test coverage gaps detected:

Missing tests:
- TestService.rerunMultipleTests()
- BulkActionBar.tsx component

Shall I add tests now? (yes/no/later)
```

### 6️⃣ Documentation Check

**Agent checks `DOCUMENTATION_UPDATE_RULES.md`:**

**You see:**

```
📝 Documentation updates recommended:

P1 (High Priority):
1. docs/API_REFERENCE.md
   Reason: New endpoint POST /api/tests/rerun-bulk

P2 (Medium Priority):
2. docs/features/BULK_TEST_RERUN.md (new)
   Reason: Significant user-facing feature

Update now? (yes/no/later)
```

---

## ⚡ Key Features

### Parallel Research

Agent launches multiple Explore agents **simultaneously** for fast context gathering.

### Smart Questions

Asks **ONLY critical questions**. Most decisions use sensible defaults.

### Progress Tracking

TodoWrite shows real-time progress - you always know what's happening.

### Architecture Compliance

Automatically follows Repository Pattern and project structure.

### Complete Validation

Never forgets format/type-check/lint/test/build checks.

### Context7-MCP Integration

Automatically checks latest dependency docs before installing.

### Documentation Awareness

Proactively suggests doc updates based on changes made.

---

## 💡 Tips

### Quick Start

```
@vibe добавить фичу X
[wait for research]
use defaults
[done!]
```

### Detailed Control

```
@vibe добавить фичу X
[wait for research + plan]
[answer questions if any]
yes
[review progress in TodoWrite]
[done!]
```

### For Bugs

```
@vibe исправить [описание бага]
```

Agent will do **very thorough** trace to find root cause.

### For Refactoring

```
@vibe рефакторинг [что именно]
```

Agent will find **all usages** and ensure no breaking changes.

---

## 📊 What You Get

After `@vibe` completes:

✅ **Code:**

- Backend following Repository Pattern
- Frontend following feature-based structure
- Best practices applied

✅ **Tests:**

- Unit tests for services
- Integration tests for API
- UI tests for components
- Coverage targets met

✅ **Validation:**

- All format/type-check/lint/test/build passed
- No TypeScript errors
- No linting issues
- All tests passing

✅ **Documentation:**

- API_REFERENCE.md updated (if endpoints added)
- Feature docs created (if significant feature)
- Architecture docs updated (if patterns changed)

✅ **Confidence:**

- Complete validation passed
- Test coverage verified
- Documentation checked
- Ready for review/commit

---

## 🎯 Expected Timeline

| Task Type          | Research | Development | Validation | Total      |
| ------------------ | -------- | ----------- | ---------- | ---------- |
| **Small feature**  | 30 sec   | 10-15 min   | 2-3 min    | ~15-20 min |
| **Medium feature** | 1-2 min  | 30-45 min   | 2-3 min    | ~35-50 min |
| **Large feature**  | 2-3 min  | 1-2 hours   | 3-5 min    | ~1-2 hours |
| **Refactoring**    | 2-3 min  | 20-60 min   | 2-3 min    | ~25-65 min |
| **Bug fix**        | 2-5 min  | 10-30 min   | 2-3 min    | ~15-40 min |

_Research is fast because agents run in parallel_

---

## 🔍 Under the Hood

### Agent Uses:

**Tools:**

- `Task` - Launch Explore/General agents
- `TodoWrite` - Track progress
- `Glob/Grep` - Search codebase (via agents)
- `Read` - Read files
- `Edit/Write` - Modify files
- `Bash` - Run validation commands
- `Context7-MCP` - Check dependency docs

**Knowledge:**

- CLAUDE.md - Project architecture
- DOCUMENTATION_UPDATE_RULES.md - When to update docs
- ANTI_PATTERNS.md - What to avoid
- FILE_LOCATIONS.md - Where things are

**Patterns:**

- Repository Pattern enforcement
- INSERT-only database strategy
- Feature-based frontend structure
- Test ID hash consistency
- Permanent attachment storage

---

## ❓ FAQ

### Q: Can I use regular requests without @vibe?

**A:** Yes! Claude Code works normally. `@vibe` is for your standard workflow automation.

### Q: Will @vibe work in new chats?

**A:** Yes! The agent configuration persists across all chats.

### Q: Can I modify the agent?

**A:** Yes! Edit `.claude/agents/vibe.md` to customize workflow.

### Q: What if I want to skip validation?

**A:** Not recommended, but you can interrupt the agent after development phase.

### Q: Does @vibe commit changes?

**A:** No. Agent NEVER commits. You do git operations manually.

### Q: Can I use @vibe for non-feature tasks?

**A:** Yes! Works for features, bugs, refactoring, enhancements, investigations.

---

## 📚 Related Documentation

- [CLAUDE.md](../../CLAUDE.md) - Project architecture and critical context
- [DOCUMENTATION_UPDATE_RULES.md](DOCUMENTATION_UPDATE_RULES.md) - When/how to update docs
- [ANTI_PATTERNS.md](ANTI_PATTERNS.md) - Common mistakes to avoid
- [FILE_LOCATIONS.md](FILE_LOCATIONS.md) - Project structure
- [ARCHITECTURE.md](../ARCHITECTURE.md) - Detailed architecture
- [DEVELOPMENT.md](../DEVELOPMENT.md) - Development best practices

---

## 🎉 Result

**Before @vibe:**

```
You: [Long detailed request about what to do, how to validate, what to check...]
Claude: [Reads files one by one, researches, asks questions...]
[5-10 minutes later]
Claude: Ready to start!
[Development]
You: Don't forget to run tests!
Claude: [Runs tests]
You: Check documentation!
Claude: [Checks docs]
```

**With @vibe:**

```
You: @vibe добавить фичу X
[30 seconds research with parallel agents]
Claude: ✅ Research complete! Plan: [...] Ready?
You: use defaults
[Development with progress tracking]
[Automatic validation]
[Automatic test coverage check]
[Automatic documentation check]
Claude: ✅ Done! All checks passed, docs updated.
```

---

**Last Updated:** October 2025

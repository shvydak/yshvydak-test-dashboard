# Documentation Audit

Perform a comprehensive documentation audit for the YShvydak Test Dashboard project.

---

## Task Overview

This command analyzes the entire documentation structure to ensure:

- **Consistency:** All references, links, and examples are valid
- **Completeness:** No missing documentation for new features
- **Accuracy:** Documentation matches current codebase
- **Token Efficiency:** Files are reasonably sized and not duplicated
- **Freshness:** Documentation is up-to-date

---

## Execution Steps

### Phase 1: Consistency Checks (10-15 min)

#### 1.1 File References Validation

Check `docs/ai/FILE_LOCATIONS.md`:

- Verify all file paths mentioned actually exist
- Check if any files have been moved/renamed
- Validate line number references (file.ts:42)

#### 1.2 API Documentation Validation

Check `docs/API_REFERENCE.md`:

- Find all documented endpoints (GET /api/..., POST /api/...)
- Search codebase for actual endpoint implementations
- Report missing endpoints or outdated signatures
- Check request/response examples match types in code

#### 1.3 Code Examples Validation

Check `docs/ai/ANTI_PATTERNS.md`:

- Verify example code patterns still exist in codebase
- Check if "wrong" examples are still patterns to avoid
- Validate "right" examples match current architecture

#### 1.4 Cross-References Validation

Check all `.md` files:

- Validate internal links `[text](path.md)`
- Check cross-references between documents
- Report broken links or references to moved files

#### 1.5 Last Updated Dates

- Check "Last Updated" field in all docs
- Warn if any file is >3 months old without updates
- List files by freshness

---

### Phase 2: Completeness Checks (10-15 min)

#### 2.1 New Endpoints Discovery

- Search for `router.get(`, `router.post(`, `router.put(`, `router.delete(` in codebase
- Compare with `docs/API_REFERENCE.md`
- Report undocumented endpoints

#### 2.2 New Components Discovery

- Search for new controllers, services, repositories in `packages/server/src/`
- Compare with `docs/ai/FILE_LOCATIONS.md`
- Report if key new components are missing from docs

#### 2.3 New Anti-Patterns Discovery

Analyze git history since last doc update:

- Look for bug fixes that might reveal anti-patterns
- Check for repeated code review comments
- Suggest adding to `docs/ai/ANTI_PATTERNS.md` if pattern seen 2+ times

#### 2.4 Feature Documentation Gaps

- List all `.ts` files in `packages/server/src/services/`
- Check if major features have corresponding `docs/features/*.md`
- Report missing feature documentation

---

### Phase 3: Architecture Alignment (5-10 min)

#### 3.1 Repository Pattern Compliance

Check if documentation reflects actual architecture:

- Controllers delegate to Services
- Services use Repositories
- No direct DB access outside repositories

#### 3.2 Frontend Structure Compliance

Check if documentation reflects actual structure:

- Feature-based organization (`features/{name}/`)
- Atomic design pattern (`shared/components/atoms/`, `molecules/`)
- Hooks in appropriate locations

#### 3.3 Test ID Generation Alignment

**CRITICAL:** Verify Reporter and Discovery use identical algorithm:

- Check `packages/reporter/src/index.ts` → `generateStableTestId()`
- Check `packages/server/src/services/playwright.service.ts` → `generateStableTestId()`
- **Must be byte-for-byte identical**

---

### Phase 4: Token Efficiency Analysis (5 min)

#### 4.1 File Size Analysis

Count lines in each documentation file:

```bash
find docs -name "*.md" -exec wc -l {} +
```

Warn if:

- Any file >1,000 lines (should be split)
- Total docs >20,000 lines (getting heavy)
- `CLAUDE.md` >200 lines (should stay concise)

#### 4.2 Duplication Analysis

Check for excessive duplication:

- Repository Pattern mentioned in N files (expected: ~5)
- Test ID Generation mentioned in N files (expected: ~3)
- Report if same info repeated without different purpose

#### 4.3 Archive Cleanup

Check `docs/archive/`:

- List all archived files
- Verify they're not referenced in active docs
- Suggest deleting if >1 year old and truly obsolete

---

### Phase 5: VIBE Coding Integration Check (5 min)

#### 5.1 VIBE Agent Documentation

Check if `docs/ai/VIBE_CODING.md`:

- Reflects current @vibe agent implementation
- Examples match actual commands
- Workflow phases match `.claude/agents/vibe.md`

#### 5.2 Documentation Update Rules

Check if `docs/ai/DOCUMENTATION_UPDATE_RULES.md`:

- Covers all types of changes in project
- Priority levels make sense
- Detection patterns are accurate

---

## Report Format

Generate a structured report:

```markdown
# 📊 Documentation Audit Report

**Date:** [Today's date]
**Auditor:** Claude Code (doc-audit command)
**Project:** YShvydak Test Dashboard

---

## Summary

- **Total MD Files:** X
- **Total Lines:** Y
- **Issues Found:** N
- **Status:** 🟢 Good / 🟡 Needs Attention / 🔴 Critical Issues

---

## 1️⃣ Consistency Issues

### High Priority (Fix Now)

- ❌ `docs/ai/FILE_LOCATIONS.md:42` - References non-existent file `src/old/file.ts`
- ❌ `docs/API_REFERENCE.md` - Missing endpoint `POST /api/tests/bulk-rerun`

### Medium Priority (Fix Soon)

- ⚠️ `docs/ai/ANTI_PATTERNS.md:150` - Example code pattern no longer in codebase
- ⚠️ `CLAUDE.md` - Link to moved file `docs/TESTING.md`

### Low Priority (Nice to Fix)

- 💡 `docs/ARCHITECTURE.md` - Last updated 4 months ago
- 💡 `docs/features/DASHBOARD_REDESIGN.md` - Could use more screenshots

---

## 2️⃣ Completeness Gaps

### Missing Documentation

- 📝 **New Endpoint:** `POST /api/tests/export-csv` (not in API_REFERENCE.md)
- 📝 **New Service:** `CsvExportService` (not in FILE_LOCATIONS.md)
- 📝 **New Feature:** CSV Export (no feature doc in `docs/features/`)

### Potential Anti-Patterns

- 🔍 Found 3 bug fixes related to "bypassing service layer" in git history
  → Consider adding to ANTI_PATTERNS.md

---

## 3️⃣ Architecture Alignment

✅ Repository Pattern - Correctly documented
✅ Feature-based Frontend - Matches codebase
✅ Test ID Generation - **Algorithms are identical** ✨

---

## 4️⃣ Token Efficiency

**File Sizes:**
```

CLAUDE.md: 150 lines ✅
docs/ai/FILE_LOCATIONS.md: 580 lines ✅
docs/ai/ANTI_PATTERNS.md: 666 lines ✅
docs/ai/CONCEPT_MAP.md: 488 lines ✅
[... other files]

Total: ~13,346 lines

```

**Token Estimate:**
- CLAUDE.md: ~1,200 tokens (auto-loaded)
- AI docs: ~9,500 tokens (on-demand)
- Features: ~X,XXX tokens (rarely loaded)
- **Total:** ~XX,XXX tokens

**Status:** 🟢 Optimal (no files over 1,000 lines)

---

## 5️⃣ Recommendations

### Immediate Actions (Do Now)
1. Fix broken file reference in FILE_LOCATIONS.md:42
2. Add missing endpoint to API_REFERENCE.md
3. Update Test ID generation example in CLAUDE.md

### Short Term (This Week)
4. Create feature doc for CSV Export
5. Update "Last Updated" dates for stale files
6. Add new anti-pattern from recent bug fixes

### Long Term (Next Month)
7. Consider splitting ANTI_PATTERNS.md if it exceeds 800 lines
8. Add more visual diagrams to CONCEPT_MAP.md
9. Review archive/ and delete files >1 year old

---

## 6️⃣ Documentation Health Score

**Overall Score: X.X/10**

Breakdown:
- Consistency: X.X/10 (Y issues found)
- Completeness: X.X/10 (Z gaps)
- Architecture Alignment: X.X/10
- Token Efficiency: X.X/10
- Freshness: X.X/10

---

## Next Steps

**Option 1: Fix All High Priority Issues**
→ I can fix the X high priority issues now

**Option 2: Review & Selective Fix**
→ Review the report and tell me which specific issues to fix

**Option 3: Manual Fix**
→ You'll handle the fixes manually

**What would you like to do?** (1/2/3)
```

---

## Validation After Fixes

If user chooses to fix issues:

1. Update all identified files
2. Update "Last Updated" dates
3. Run quick re-check on fixed items
4. Confirm: "✅ Fixed X issues. Documentation audit complete!"

---

## Usage Notes

**When to run:**

- Every 10-15 major features
- Before major releases (v1.0, v2.0)
- Every 1-2 months
- After major refactoring
- When documentation feels "stale"

**Estimated time:** 30-45 minutes for full audit

---

**Last Updated:** January 2025

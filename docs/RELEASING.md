# Release Process

This document describes the versioning and release process for `yshvydak-test-dashboard`.

## 🚀 Quick Start (TL;DR)

**For a quick release (recommended):**

```bash
# 1. In develop - apply changesets
git checkout develop && npm run version

# 2. Commit + tag
git add . && git commit -m "chore: release v1.1.0"
git tag dashboard-v1.1.0

# 3. Push to develop
git push origin develop --follow-tags

# 4. Create PR: develop → main via GitHub UI

# 5. Merge PR → automatic deployment via n8n
```

**Details below** ⬇️

---

## 📚 Table of Contents

- [Daily Development](#daily-development)
- [Creating a Changeset](#creating-a-changeset)
- [Release Process](#release-process)
    - [⭐ Recommended: Versioning in Develop](#-recommended-versioning-in-develop)
    - [🔄 Alternative: Versioning in Main (Solo Dev)](#-alternative-versioning-in-main-solo-dev)
- [Scenario Examples](#scenario-examples)
- [Quick Reference Commands](#quick-reference-commands)
- [Troubleshooting](#troubleshooting)

---

## 🛠 Daily Development

### 1. Create Feature/Fix Branch

```bash
# For new functionality
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name

# For bug fixing
git checkout develop
git pull origin develop
git checkout -b fix/your-bug-name
```

### 2. Development

Make code changes as usual.

### 3. Creating a Changeset

**IMPORTANT:** Create a changeset ONLY if:

- Changes affect package functionality
- A version update is required

**A changeset is NOT needed for:**

- Documentation changes
- Test updates (without functional changes)
- Routine tasks (chore)

**How to create a changeset:**

```bash
npm run changeset
```

The interactive prompt will ask:

#### Step 1: Select packages

```
? Which packages would you like to include?
  [ ] @yshvydak/server
  [ ] @yshvydak/web
  [ ] playwright-dashboard-reporter
```

**Select ONLY the packages that have changed.**

For example:

- Changes only in dashboard → select `server` and `web`
- Changes only in reporter → select `playwright-dashboard-reporter`
- Changes in both → select all three

#### Step 2: Type of change

For each selected package:

```
? What kind of change is this for @yshvydak/server?
  [ ] major - Breaking change (1.0.0 → 2.0.0)
  [ ] minor - New feature (1.0.0 → 1.1.0)
  [ ] patch - Bug fix (1.0.0 → 1.0.1)
```

**When to use:**

- **major** - BREAKING CHANGE
    - API changed (endpoints removed/renamed)
    - Data format changed (incompatible with previous version)
    - Requires migration for users

- **minor** - New functionality
    - Added a new feature
    - Added a new API endpoint
    - Improved existing functionality
    - Backward compatibility maintained

- **patch** - Bug fix
    - Fixed a bug
    - Improved performance
    - Fixed a typo

#### Step 3: Change description

```
? Please enter a summary for this change (this will be written to the changelog).
  Submit empty line to open external editor
>
```

**Good examples:**

```
✅ Add bulk test rerun functionality with batch processing
✅ Fix WebSocket reconnection issue after network interruption
✅ Improve test filtering performance by 50%
```

**Bad examples:**

```
❌ Fixed bug
❌ Updated code
❌ Changes
```

**Description rules:**

- Write in English
- Start with a verb in the present tense (Add, Fix, Improve, Update)
- Be specific - describe WHAT changed
- You can add details in subsequent lines

**Result:**

A file `.changeset/random-name-abc123.md` with your changes will be created.

### 4. Commit with Conventional Commits

```bash
git add .
git commit -m "feat(server): add bulk test rerun functionality"
```

**Format:**

```
type(scope): subject

[optional: body]

[optional: footer]
```

**Types:**

- `feat:` - new feature
- `fix:` - bug fix
- `docs:` - documentation changes
- `chore:` - routine tasks (build, deps)
- `refactor:` - refactoring
- `test:` - tests
- `perf:` - performance improvements

**Scope:**

- `server` - changes in packages/server
- `web` - changes in packages/web
- `reporter` - changes in packages/reporter
- `dashboard` - changes in server + web
- `*` - changes in the entire project

**Examples:**

```bash
git commit -m "feat(reporter): add video attachment support"
git commit -m "fix(server): resolve database connection issue"
git commit -m "docs: update QUICKSTART.md with new setup steps"
git commit -m "chore(deps): update playwright to 1.55.0"
```

### 5. Push and Pull Request

```bash
git push origin feature/your-feature-name
```

Create a Pull Request to `develop` via GitHub UI.

---

## 📦 Release Process

When changes have accumulated and are ready for release:

### ⭐ Recommended: Versioning in Develop

This approach is safer - you will see version changes in the Pull Request before going to production.

### Step 1: Check what will be released

```bash
git checkout develop
git pull origin develop

npm run changeset:status
```

You will see a list of packages and versions that will be updated.

### Step 2: Apply Changesets in Develop

```bash
# Remaining in develop, apply changesets
npm run version
```

**What will happen:**

1. Changesets will read all `.changeset/*.md` files
2. Update `package.json` versions for affected packages
3. Create or update `CHANGELOG.md` for each package
4. Delete used `.changeset/*.md` files

**Example output:**

```
🦋  All files have been updated. Review them and commit at your leisure
🦋  info @yshvydak/server: 1.0.0 => 1.1.0
🦋  info @yshvydak/web: 1.0.0 => 1.1.0
🦋  info playwright-dashboard-reporter: 1.0.3 => 1.0.4
```

### Step 3: Review changes

```bash
git status
git diff
```

**Check:**

- `package.json` versions are updated correctly
- `CHANGELOG.md` contains correct descriptions
- All changeset files are deleted

### Step 4: Commit version changes

```bash
git add .
git commit -m "chore: release v1.1.0

- @yshvydak/server@1.1.0
- @yshvydak/web@1.1.0
- playwright-dashboard-reporter@1.0.4"
```

### Step 5: Create Git Tags

```bash
# If dashboard (server/web) changed
git tag dashboard-v1.1.0 -m "Dashboard release 1.1.0"

# If reporter changed
git tag reporter-v1.0.4 -m "Reporter release 1.0.4"
```

### Step 6: Push to Develop with tags

```bash
git push origin develop --follow-tags
```

### Step 7: Create Pull Request

1. Go to GitHub: https://github.com/shvydak/yshvydak-test-dashboard
2. Create Pull Request: `develop` → `main`
3. **Title:** "Release v1.1.0"
4. **Description:** Copy the content from the updated `CHANGELOG.md`

**In the PR you will see:**

- ✅ Version changes in `package.json`
- ✅ New entries in `CHANGELOG.md`
- ✅ Deleted changeset files

### Step 8: Merge Pull Request

After review (you can review yourself):

1. Merge PR via GitHub UI
2. **n8n webhook will automatically deploy** the new version to production

### Step 9: Publish Reporter to NPM (if needed)

**ONLY if `playwright-dashboard-reporter` version has changed:**

```bash
npm run release:reporter
```

Or manually:

```bash
cd packages/reporter
npm publish
```

**IMPORTANT:** Make sure you are logged in to NPM:

```bash
npm whoami  # Check current account
npm login   # If not logged in
```

### Step 10: Create GitHub Release (optional)

1. Go to https://github.com/shvydak/yshvydak-test-dashboard/releases
2. Click "Draft a new release"
3. Select a tag (e.g., `dashboard-v1.1.0`)
4. **Title:** "Dashboard v1.1.0" or "Reporter v1.0.4"
5. **Description:** Copy the content from the corresponding `CHANGELOG.md`
6. Publish

### Step 11: Sync Develop (automatic)

After merging the PR, develop is automatically synced with main.
If needed - you can update locally:

```bash
git checkout develop
git pull origin develop
```

---

## 🔄 Alternative Approach: Versioning in Main (Solo Dev)

If you are working alone and want minimal steps without PRs:

```bash
# 1. Merge develop into main LOCALLY (do not push!)
git checkout main
git pull origin main
git merge develop

# 2. Apply changesets IMMEDIATELY
npm run version

# 3. Review changes
git status
git diff

# 4. Commit EVERYTHING together
git add .
git commit -m "chore: release v1.1.0

- @yshvydak/web@1.1.0"

# 5. Create tags
git tag dashboard-v1.1.0

# 6. ONE push with everything at once
git push origin main --follow-tags
# n8n webhook will deploy the new version

# 7. Publish reporter (if needed)
npm run release:reporter

# 8. Sync develop
git checkout develop
git merge main
git push origin develop
```

**Advantages:** Faster, one deploy instead of two
**Disadvantages:** No review process, version changes not visible in PR

---

## 📖 Scenario Examples

### Scenario 1: Bug Fix in Dashboard (without reporter)

```bash
# 1. Create branch
git checkout develop
git checkout -b fix/websocket-reconnection

# 2. Fix bug in packages/server/src/websocket.ts
# ... code ...

# 3. Create changeset
npm run changeset
# ? Which packages: [x] @yshvydak/server
# ? What kind: [x] patch
# ? Summary: Fix WebSocket reconnection after network interruption

# 4. Commit
git add .
git commit -m "fix(server): resolve WebSocket reconnection issue"

# 5. Push and PR
git push origin fix/websocket-reconnection
# Create PR to develop via GitHub

# 6. After PR merge - reporter version will NOT change
```

**Result after release:**

- server: 1.0.0 → 1.0.1
- web: no changes
- reporter: no changes

---

### Scenario 2: New Feature in Reporter

```bash
# 1. Create branch
git checkout develop
git checkout -b feat/video-attachments

# 2. Add functionality to packages/reporter/src/index.ts
# ... code ...

# 3. Create changeset
npm run changeset
# ? Which packages: [x] playwright-dashboard-reporter
# ? What kind: [x] minor
# ? Summary: Add support for video attachments in test reports

# 4. Commit
git add .
git commit -m "feat(reporter): add video attachment support"

# 5. Push and PR
git push origin feat/video-attachments

# 6. After release - publish to NPM
npm run release:reporter
```

**Result after release:**

- server: no changes
- web: no changes
- reporter: 1.0.3 → 1.1.0

---

### Scenario 3: Feature affecting everything (Dashboard + Reporter)

```bash
# 1. Create branch
git checkout develop
git checkout -b feat/parallel-execution

# 2. Changes in:
# - packages/reporter/src/index.ts (data capture)
# - packages/server/src/services/test.service.ts (processing)
# - packages/web/src/features/tests/TestList.tsx (display)

# 3. Create changeset
npm run changeset
# ? Which packages:
#   [x] @yshvydak/server
#   [x] @yshvydak/web
#   [x] playwright-dashboard-reporter
# ? What kind for server: [x] minor
# ? What kind for web: [x] minor
# ? What kind for reporter: [x] minor
# ? Summary: Add support for parallel test execution tracking

# 4. Commit
git add .
git commit -m "feat: add parallel test execution support

- Reporter: capture parallel execution metadata
- Server: process and store parallel test data
- Web: display parallel execution status"

# 5. Push and PR
git push origin feat/parallel-execution

# 6. After release - publish reporter
npm run release:reporter
```

**Result after release:**

- server: 1.0.0 → 1.1.0
- web: 1.0.0 → 1.1.0
- reporter: 1.0.3 → 1.1.0

---

### Scenario 4: Breaking Change (Major Version)

```bash
# 1. Create branch
git checkout develop
git checkout -b refactor/api-v2

# 2. Change API endpoints (incompatible changes)
# - Renamed /api/tests → /api/v2/tests
# - Changed response format

# 3. Create changeset
npm run changeset
# ? Which packages: [x] @yshvydak/server
# ? What kind: [x] major  ⚠️ BREAKING CHANGE
# ? Summary: Migrate to API v2 with new endpoint structure

BREAKING CHANGE: API endpoints moved to /api/v2/
- Renamed /api/tests to /api/v2/tests
- Changed response format for test results

# 4. Commit
git add .
git commit -m "refactor(server)!: migrate to API v2

BREAKING CHANGE: API endpoints moved to /api/v2/"

# 5. After release
# server: 1.0.0 → 2.0.0  ⚠️ MAJOR bump
```

---

## 🚀 Quick Reference Commands

```bash
# Create changeset (interactive)
npm run changeset

# See what will be released
npm run changeset:status

# Apply changesets (update versions)
npm run version

# Publish reporter to NPM
npm run release:reporter

# Check NPM login
npm whoami

# Log in to NPM
npm login
```

---

## ❓ Troubleshooting

### Problem: Forgot to create a changeset

**Solution:**

```bash
# Create changeset now
npm run changeset

# Commit changeset
git add .changeset/
git commit -m "chore: add missing changeset for previous changes"
git push
```

---

### Problem: Created a changeset for the wrong package

**Solution:**

```bash
# Find the changeset file
ls .changeset/

# Delete it
rm .changeset/random-name-abc123.md

# Create a new correct one
npm run changeset
```

---

### Problem: Want to cancel a release

**If NOT yet pushed:**

```bash
git reset HEAD~1  # Undo last commit
git restore .     # Restore files
```

**If ALREADY pushed to main:**

```bash
# DO NOT git revert on main!
# This will trigger n8n deploy

# Instead:
# 1. Create a hotfix to revert changes
# 2. Make a new release
```

---

### Problem: NPM publication failed

**Check:**

```bash
# 1. Are you logged in?
npm whoami

# 2. Publishing rights
npm owner ls playwright-dashboard-reporter

# 3. Does the version already exist?
npm view playwright-dashboard-reporter versions
```

**Solution:**

```bash
# If the version already exists, you need to:
# 1. Revert the version in package.json
# 2. Create a new changeset
# 3. Make a new release
```

---

### Problem: Merge conflict during develop → main merge

**Solution:**

```bash
git checkout main
git merge develop

# Resolve conflicts in files
# Conflicts usually occur in:
# - package.json (versions)
# - CHANGELOG.md

# After resolving:
git add .
git commit
git push origin main
```

---

## 📝 Pre-Release Checklist

```markdown
- [ ] All PRs merged into develop
- [ ] All changesets created
- [ ] Tests passed (npm test)
- [ ] Build successful (npm run build)
- [ ] develop merged into main
- [ ] npm run version executed
- [ ] Versions in package.json are correct
- [ ] CHANGELOG.md contains correct descriptions
- [ ] Commit "chore: release packages" created
- [ ] Git tags created
- [ ] Pushed to main with tags
- [ ] Reporter published to NPM (if changed)
- [ ] GitHub Release created (optional)
- [ ] main merged back into develop
```

---

## 🎯 Best Practices

### ✅ DO:

- Create a changeset for each significant change
- Write clear descriptions in changesets
- Use conventional commits
- Check `npm run changeset:status` before release
- Create Git tags for each release
- Sync develop ← main after release

### ❌ DON'T:

- DO NOT manually edit versions in package.json
- DO NOT manually edit CHANGELOG.md
- DO NOT delete changesets before running `npm run version`
- DO NOT push to main without a PR (except for release commits)
- DO NOT forget to publish the reporter to NPM

---

## 📚 Useful Links

- [Changesets Documentation](https://github.com/changesets/changesets)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [NPM Publishing Guide](https://docs.npmjs.com/cli/v10/commands/npm-publish)

---

**Last Updated:** November 17, 2024
**Document Version:** 1.0.0
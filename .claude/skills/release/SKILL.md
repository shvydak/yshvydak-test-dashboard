---
name: release
description: Cut a release — publish the reporter to npm and/or version the dashboard packages, tag, push. Manual only; has side effects (git tags, npm publish).
disable-model-invocation: true
argument-hint: [reporter|dashboard] [patch|minor|major]
---

# Release: $ARGUMENTS

Full procedure with rationale: [docs/RELEASING.md](../../../docs/RELEASING.md) — follow it step by step; this is the short form. The repo has no CI publish/deploy workflow, so every step is manual.

**Confirm with the user before the commit, `npm publish` and the tag push. Publishing and pushed tags are hard to undo.**

Tags (one scheme): `reporter-vX.Y.Z`, `dashboard-vX.Y.Z`. Annotated (`-m`).

## Reporter (`playwright-dashboard-reporter`)

1. On `develop`, clean tree. `npm whoami`; `npm view playwright-dashboard-reporter version`. The local version must end up higher than the registry version.
2. Bump from the repo root (skip if `packages/reporter/package.json` is already higher than the registry):
   `npm version <patch|minor|major> -w playwright-dashboard-reporter --no-git-tag-version`.
   `git diff --stat` must show exactly 2 changed lines: `packages/reporter/package.json` and the `packages/reporter` entry in `package-lock.json` (else `npm install --package-lock-only`). On some npm versions the whole lockfile is re-indented from 4 to 2 spaces (~26k-line diff; prettier ignores that file). Then restore it: `node -e "const f='package-lock.json',fs=require('fs');fs.writeFileSync(f,JSON.stringify(JSON.parse(fs.readFileSync(f)),null,4)+'\n')"` and re-check `git diff --stat`.
3. Commit: `chore(reporter): release X.Y.Z`.
4. Check: `npm run type-check`, `npx vitest run --project reporter`, `npm run build -w playwright-dashboard-reporter`, `npm pack --dry-run -w playwright-dashboard-reporter` (version must be X.Y.Z).
5. Publish: `cd packages/reporter && npm publish` (add `--otp=<code>` if 2FA is on). `prepublishOnly` rebuilds and type-checks; `--access public` is not needed.
6. Verify: `npm view playwright-dashboard-reporter version`.
7. Tag and push: `git tag reporter-vX.Y.Z -m "Reporter release X.Y.Z"`, `git push origin develop --follow-tags`.
8. Consumers update with `npm install playwright-dashboard-reporter@latest`.

## Dashboard (`@yshvydak/server`, `@yshvydak/web`, `@yshvydak/core`)

Versioned with Changesets, the three together with the same bump type. Skip for docs-only, test-only and internal refactors.

1. `npm run changeset` — tick server + web + core, same bump type, short summary; do NOT tick `playwright-dashboard-reporter` (it is offered because `ignore: []`; its version is bumped by hand); commit the changeset file.
2. `npm run version`; check `node -e "for (const p of ['server','web','core']) console.log(p, require('./packages/'+p+'/package.json').version)"` — all identical.
3. Commit `chore: release vX.Y.Z`.
4. `git tag dashboard-vX.Y.Z -m "Dashboard release X.Y.Z"` (version from `packages/server/package.json`), then `git push origin <branch> --follow-tags`.
5. Deploying a build is manual (`npm run deploy:prod` on the host); see RELEASING.md.

## After publishing

Production loads `playwright-dashboard-reporter` from the test project's `node_modules`. Local development uses `npm link` — a published version does not reach a linked checkout, and edits in a linked checkout never reach production. If the reporter behaves like an older version, check which of the two is in play before debugging anything else.

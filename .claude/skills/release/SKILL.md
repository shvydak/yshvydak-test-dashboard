---
name: release
description: Cut a release with changesets — version the dashboard packages together, tag, merge, and publish the reporter to npm. Manual only; has side effects (git tags, npm publish).
disable-model-invocation: true
argument-hint: [patch|minor|major]
---

# Release: $ARGUMENTS

Full reference: [docs/RELEASING.md](../../../docs/RELEASING.md). This is the short path — read the doc for the develop-first variant and the FAQ.

**Confirm with the user before step 5 (tags) and step 7 (npm publish). Both are hard to undo.**

## Version rule

`@yshvydak/server`, `@yshvydak/web` and `@yshvydak/core` are versioned **together, always, with the same bump type** — they ship as one dashboard. `playwright-dashboard-reporter` is versioned **only when the reporter actually changed**; it has its own version line (currently independent of the dashboard).

Skip the changeset entirely for: docs-only edits, test-only changes, internal refactors with no behaviour change, CI config.

## Steps

1. **Branch.** Work on a feature branch off `develop`. `main` is the deploy branch.

2. **Changeset.** `npm run changeset`
    - Tick server + web + core together, same bump type.
    - Tick the reporter only if `packages/reporter/src/` changed.
    - Summary: short first line, then the detail.
    - Commit the changeset file on its own.

3. **Apply.** `npm run version` — updates versions, writes CHANGELOGs, deletes the changeset files.

4. **Check.** Confirm server/web/core came out identical:

```bash
node -e "for (const p of ['server','web','core','reporter']) console.log(p, require('./packages/'+p+'/package.json').version)"
```

Commit the version bump.

5. **Tag.** Dashboard tag `vX.Y.Z`. If the reporter moved, add a separate `reporter-vX.Y.Z`. Tags follow commits, so deleting the branch later is safe.

6. **Merge.** PR into `main` (or `develop`). Merging to `main` triggers the n8n deploy. If you merged to `main`, sync `develop` afterwards.

7. **Publish the reporter**, only if its version changed:

```bash
npm whoami            # confirm the right npm account first
npm run release:reporter
```

`prepublishOnly` runs `build` + `type-check`, so a broken build fails the publish rather than shipping.

## After publishing

Production loads `playwright-dashboard-reporter` from `node_modules`. Local development uses `npm link` — a published version does not reach a linked checkout, and edits in a linked checkout never reach production. If the reporter behaves like an older version, check which of the two is in play before debugging anything else.

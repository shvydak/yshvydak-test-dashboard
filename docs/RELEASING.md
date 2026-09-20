# Releasing

This repo has no CI workflows (no `.github/` directory): nothing is published, tagged or deployed automatically. Every step below is run by hand.

## Tag scheme

One scheme for both parts, annotated tags:

- `reporter-vX.Y.Z` for `playwright-dashboard-reporter`
- `dashboard-vX.Y.Z` for the dashboard (`@yshvydak/server`, `@yshvydak/web`, `@yshvydak/core`)

## Reporter (`playwright-dashboard-reporter`, npm)

The package lives in `packages/reporter`. It is versioned independently of the dashboard: it depends only on `dotenv` and `uuid` (not on `@yshvydak/core`), has peer dependency `@playwright/test ^1.40.0`, and `publishConfig.access` is `public`.

Placeholders below: `X.Y.Z` is the new version, `<bump>` is `patch`, `minor` or `major`.

1. **Preconditions.** On `develop`, clean tree (`git status`). Check the account and the current registry version:

    ```bash
    npm whoami
    npm view playwright-dashboard-reporter version
    ```

    The version in `packages/reporter/package.json` must be higher than the registry version; npm refuses to publish a version that already exists. If it is already higher, skip step 2.

2. **Bump** (from the repo root; use npm rather than editing the file, so the lockfile stays in sync):

    ```bash
    npm version <bump> -w playwright-dashboard-reporter --no-git-tag-version
    git diff --stat
    ```

    Expected diff: exactly two changed lines, the `version` in `packages/reporter/package.json` and in the `packages/reporter` entry of `package-lock.json`. If `package-lock.json` is not updated, run `npm install --package-lock-only`. On some npm versions the bump re-indents the whole `package-lock.json` from 4 to 2 spaces (a diff of about 26k lines; `.prettierignore` excludes the file, so prettier will not fix it). If that happens, restore 4-space indentation and check `git diff --stat` again:

    ````bash
    node -e "const f='package-lock.json',fs=require('fs');fs.writeFileSync(f,JSON.stringify(JSON.parse(fs.readFileSync(f)),null,4)+'\n')"
    ``` In a workspace npm does not commit or tag on its own; `--no-git-tag-version` keeps that explicit.

    Optional: add an entry to `packages/reporter/CHANGELOG.md` (its last entry is 1.0.4; later versions were bumped by hand).

    ````

3. **Commit.** `git commit -am "chore(reporter): release X.Y.Z"` (review `git status` first so nothing unrelated is included).

4. **Check** (from the repo root):

    ```bash
    npm run type-check
    npx vitest run --project reporter
    npm run build -w playwright-dashboard-reporter
    npm pack --dry-run -w playwright-dashboard-reporter
    ```

    `npm pack --dry-run` must show `version: X.Y.Z` and list `README.md`, `package.json`, `dist/*` and `LICENSE` (npm adds `LICENSE` only if the file exists in `packages/reporter/`). It uploads nothing.

5. **Publish.**

    ```bash
    cd packages/reporter
    npm publish
    ```

    `prepublishOnly` runs `npm run build && npm run type-check` first, so a broken build fails the publish. `--access public` is not needed (`publishConfig`). With 2FA on the account add `--otp=<code>`. `npm run release:reporter` at the repo root does the same as the two commands above.

6. **Verify.** `npm view playwright-dashboard-reporter version` prints `X.Y.Z`.

7. **Tag and push.**

    ```bash
    git tag reporter-vX.Y.Z -m "Reporter release X.Y.Z"
    git push origin develop --follow-tags
    ```

8. **Update consumers.** In each test project that uses the reporter:

    ```bash
    npm install playwright-dashboard-reporter@latest
    ```

    Projects that declare a caret range (`^1.0.7`) and keep a lockfile stay on the locked version until they run `npm install` with an explicit version or `npm update playwright-dashboard-reporter`. The dashboard resolves the reporter from the test project's `node_modules` (`--reporter=playwright-dashboard-reporter`, working directory `PLAYWRIGHT_PROJECT_DIR`), so a new dashboard build alone does not change which reporter runs.

Local development: `npm link` (see [archive/NPM_LINK_SETUP.md](archive/NPM_LINK_SETUP.md)). A linked checkout does not receive published versions, and edits in `packages/reporter/src` do not reach a non-linked install.

## Dashboard (server, web, core)

The three packages are versioned with Changesets (`.changeset/config.json`, one `CHANGELOG.md` per package; they are currently at the same version). Convention: bump `@yshvydak/server`, `@yshvydak/web` and `@yshvydak/core` together with the same bump type. The root `package.json` (`private`) has its own version line.

1. `npm run changeset`: select server, web and core, the same bump type, write a short summary. Do not select `playwright-dashboard-reporter` (`.changeset/config.json` has `ignore: []`, so it is offered): its version is bumped by hand. Commit the changeset file.
2. `npm run version`: applies the pending changesets (bumps versions, updates the `CHANGELOG.md` files, removes the changeset files). Check the result:

    ```bash
    node -e "for (const p of ['server','web','core']) console.log(p, require('./packages/'+p+'/package.json').version)"
    ```

3. Commit: `chore: release vX.Y.Z`.
4. Tag: `git tag dashboard-vX.Y.Z -m "Dashboard release X.Y.Z"` (use the version from `packages/server/package.json`), then `git push origin <branch> --follow-tags`.

Skip the changeset for documentation-only, test-only and internal refactoring changes.

Deploying a build is not automated by this repo. On a host it is done with the pm2 scripts in the root `package.json` (`ecosystem.config.js`): `npm run deploy:prod` runs `git pull && npm install && npm run auto:prod` (build, pm2 restart, `pm2 save`).

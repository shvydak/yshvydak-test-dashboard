# Development TODO

## Known Issues

### Active Issues

- `[ ]` Delete test (with confirmation 'warning!')
- `[ ]` Test (jest) to dashboard
- `[ ]` Failed group tests: run only failed tests (not all tests in the group)
- `[ ]` Add progress bar
- `[ ]` Run All Tests loading only on run all tests or show what test executes now

### Completed Issues ✅

- `[X]` Remove from documentation [reporter] - we use cli command!
- `[X]` Abbility to set workers in the settings modal window
- `[X]` Test modal window with blur - **FIXED**: ModalBackdrop component with blur effect and click-outside closing (see ARCHITECTURE.md and DEVELOPMENT.md)
- `[X]` Dashboard Settings popup with buttons
- `[X]` RUN button in the tests modal window (and immediatly data update) - **FIXED**: Rerun from modal with real-time updates (see [@docs/features/RERUN_FROM_MODAL.md](../features/RERUN_FROM_MODAL.md))

- `[X]` Attachments overridden by the next test run - **FIXED**: Permanent attachment storage implemented (see [@docs/features/PER_RUN_ATTACHMENTS.md](../features/PER_RUN_ATTACHMENTS.md))
- `[X]` Historical Context: track test over time - **FIXED**: Historical test tracking implemented (see [@docs/features/HISTORICAL_TEST_TRACKING.md](../features/HISTORICAL_TEST_TRACKING.md))
- `[X]` When JWT expired - the user is not logged out - **FIXED**: Automatic logout on token expiry with periodic validation (see [@docs/features/AUTHENTICATION_IMPLEMENTATION.md](../features/AUTHENTICATION_IMPLEMENTATION.md))

# Check:

`╭─    ~/Projects/yshvydak-test-dashboard    develop \*1 ────────────────────────────────────────────────────────────────────────────────────────── ✔  00:52:03  ─╮
╰─ npm install ─╯
npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
npm warn deprecated @npmcli/move-file@1.1.2: This functionality has been moved to @npmcli/fs
npm warn deprecated npmlog@6.0.2: This package is no longer supported.
npm warn deprecated @humanwhocodes/config-array@0.13.0: Use @eslint/config-array instead
npm warn deprecated rimraf@3.0.2: Rimraf versions prior to v4 are no longer supported
npm warn deprecated are-we-there-yet@3.0.1: This package is no longer supported.
npm warn deprecated @humanwhocodes/object-schema@2.0.3: Use @eslint/object-schema instead
npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
npm warn deprecated gauge@4.0.4: This package is no longer supported.
npm warn deprecated source-map@0.8.0-beta.0: The work that was done in this beta branch won't be included in future versions
npm warn deprecated eslint@8.57.1: This version is no longer supported. Please see https://eslint.org/version-support for other options.

added 857 packages, and audited 867 packages in 4s

196 packages are looking for funding
run `npm fund` for details

3 moderate severity vulnerabilities

To address all issues, run:
npm audit fix

Run `npm audit` for details.

╭─    ~/Projects/yshvydak-test-dashboard    develop \*1 ─────────────────────────────────────────────────────────────────────────────────── ✔  4s   00:52:19  ─╮
╰─ ─╯`

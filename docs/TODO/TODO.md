# Development TODO

## Known Issues

### Active Issues

- `[ ]` Same name tests error!
- `[ ]` Clickable statistic lead to test page (filter -> all, passed, failed... )
- `[ ]` Documentation - when should add tests?
- `[ ]` Implement multiprojects supporting
- `[ ]` Button loader for relevant test
- `[ ]` Show annotation/descriptions in a test
- `[ ]` Memory usage (attachments)
- `[ ]` Delete test (with confirmation 'warning!')
- `[ ]` Failed group tests: run only failed tests (not all tests in the group)
- `[ ]` Add progress bar
- `[ ]` Run All Tests loading only on run all tests or show what test executes now
- `[ ]` Clearn package.json scripts

### Completed Issues ✅

- `[X]` Statistic without 'skipped' tests
- `[X]` Test (jest/vitest) to dashboard
- `[X]` Remove from documentation [reporter] - we use cli command!
- `[X]` Abbility to set workers in the settings modal window
- `[X]` Test modal window with blur - **FIXED**: ModalBackdrop component with blur effect and click-outside closing (see ARCHITECTURE.md and DEVELOPMENT.md)
- `[X]` Dashboard Settings popup with buttons
- `[X]` RUN button in the tests modal window (and immediatly data update) - **FIXED**: Rerun from modal with real-time updates (see [@docs/features/RERUN_FROM_MODAL.md](../features/RERUN_FROM_MODAL.md))

- `[X]` Attachments overridden by the next test run - **FIXED**: Permanent attachment storage implemented (see [@docs/features/PER_RUN_ATTACHMENTS.md](../features/PER_RUN_ATTACHMENTS.md))
- `[X]` Historical Context: track test over time - **FIXED**: Historical test tracking implemented (see [@docs/features/HISTORICAL_TEST_TRACKING.md](../features/HISTORICAL_TEST_TRACKING.md))
- `[X]` When JWT expired - the user is not logged out - **FIXED**: Automatic logout on token expiry with periodic validation (see [@docs/features/AUTHENTICATION_IMPLEMENTATION.md](../features/AUTHENTICATION_IMPLEMENTATION.md))

# Task:

Я не знаю на что способен проект с технической точки зрения, проанализируй и скажи каким образом я могу реализовать фичу прогресс выполнения теста/тестов. Сейчас когда я запускаю тест или тесты - я просто вижу, что кнопки заблокированы и что крутится loader, так я понимаю что запущены тесты, но какие тест и на каком этапе я не знаю. Предложи мне решение. Важно, чтобы прогрес не исчезал при перезагрузке страницы или при новом логине, чтобы он автоматически подтягивался и обновлялся.

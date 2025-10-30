# Development TODO

## Known Issues

### Active Issues

- `[ ]` Notes for test run
- `[ ]` Open test modal window when clicking on the progress bar test
- `[ ]` Show annotation/descriptions in a test
- `[ ]` Link to github repo
  now
- `[ ]` Clearn package.json scripts
- `[ ]` Implement multiprojects supporting

### Completed Issues ✅

- `[X]` Memory usage (attachments)
- `[X]` Clickable statistic lead to test page (filter -> all, passed, failed... )
- `[X]` Statistic - fail percentage by passed tests (not all)
- `[X]` Button loader for relevant test
- `[X]` Failed group tests: run only failed tests (not all tests in the group)
- `[X]` Add progress bar
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

Проблема:
На странице Tests если кликнуть на фильтр Failed (FilterButtonGroup если я не ошибаюсь) то отображаются упавшие тесты.
Выбрав этот фильтр Failed у меня есть возможность запустить как одиночный тест так и группу Тестов. Так вот предположим что в группе Тестов всего есть пять Тестов, которые находятся в одном тестовом файле, ну из этого файла упало всего предположим два теста – и эти два теста отображаются фильтры Failed . Так вот если фильтре Failed мы запустим групповой тест в котором отображаются предположим два упавших теста – то в реальности запустятся все тесты находящиеся в файле. Как можно именно фильтре Failed нажатием на запуск групповых Тестов запускать только упавшие тесты а не все тесты из файла? Остальные фильтры не требуется затрагивать – они работают как положено. Если нужна документация для playwright используй Context7-mcp.

---

**Last Updated:** October 2025

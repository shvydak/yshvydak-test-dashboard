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

# Task:
как ты считаешь, имеет ли смысл добавить тесты (unit или какие-то другие) для этого проекта? Посоветуй мне, согласно лучших практик и архитектре и функциональности этого проекта. Хорошо проанализируй весь мой проект предложи самый лучший вариант. для архитектуры и стека моего проекта, предложенный тобой вариант соответствует лучшим практикам и подходам именно для моего проекта. я хочу чтобы ты 
  сделал research и перед тем как начинать что-то разрабатывать - я хочу убедиться что мы используем самые лучшие, современные и подходы согласно лучших 
  практик для моего проекта
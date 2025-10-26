# Development TODO

## Known Issues

### Active Issues

- `[ ]` Clickable statistic lead to test page (filter -> all, passed, failed... )
- `[ ]` Documentation - when should add tests?
- `[ ]` Implement multiprojects supporting
- `[ ]` Button loader for relevant test
- `[ ]` Show annotation/descriptions in a test
- `[ ]` Statistic without 'skipped' tests
- `[ ]` Memory usage (attachments)
- `[ ]` Delete test (with confirmation 'warning!')
- `[ ]` Failed group tests: run only failed tests (not all tests in the group)
- `[ ]` Add progress bar
- `[ ]` Run All Tests loading only on run all tests or show what test executes now
- `[ ]` Clearn package.json scripts

### Completed Issues ✅

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

Привет! Нужно исправить баг в функции "Clear All Data".

**Проблема:**
Когда пользователь нажимает "Clear All Data" в настройках, очищается только база данных, но физические файлы attachments остаются на диске.

**Текущая реализация:**

- `packages/server/src/services/test.service.ts` → `clearAllTests()` только вызывает `testRepository.clearAllTests()`
- `packages/server/src/database/database.manager.ts` → `clearAllData()` делает `DELETE FROM test_runs, test_results, attachments`
- Результат: БД чистая, но файлы в `packages/server/test-results/attachments/` остаются (5.2GB!)

**Что нужно сделать:**

1. Добавить метод в `packages/server/src/storage/attachmentManager.ts`:

````typescript
async clearAllAttachments(): Promise<void> {
    // Удалить всю папку attachments и пересоздать пустую
}
Добавить метод в packages/server/src/services/attachment.service.ts:
async clearAllAttachments(): Promise<void> {
    await this.attachmentManager.clearAllAttachments()
}
Обновить packages/server/src/services/test.service.ts:
async clearAllTests(): Promise<void> {
    await this.testRepository.clearAllTests()
    await this.attachmentService.clearAllAttachments() // ДОБАВИТЬ!
}
Написать тест в packages/server/src/services/__tests__/attachment.service.test.ts для проверки clearAllAttachments()
Требования:
Использовать fs.promises.rm(dir, { recursive: true, force: true })
Пересоздать пустую папку после удаления
Добавить error handling
Логировать результат (сколько файлов удалено)
Написать unit тест
Контекст: Проект: Playwright Test Dashboard Stack: Node.js, TypeScript, SQLite Следуй архитектуре: Controller → Service → Repository/Manager Начни с реализации метода в AttachmentManager.

---

## 📝 Дополнительная информация (если нужно):

**Структура файлов:**
- `packages/server/src/storage/attachmentManager.ts` - управление файлами
- `packages/server/src/services/attachment.service.ts` - бизнес-логика
- `packages/server/src/services/test.service.ts` - orchestration

**Путь к attachments:**
```typescript
this.attachmentsDir = path.join(baseDir, 'test-results', 'attachments')
Удачи! 🚀
````

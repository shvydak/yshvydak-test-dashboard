# Release Process

Этот документ описывает процесс версионирования и релиза для yshvydak-test-dashboard.

## 📚 Оглавление

- [Ежедневная Разработка](#ежедневная-разработка)
- [Создание Changeset](#создание-changeset)
- [Процесс Релиза](#процесс-релиза)
- [Примеры Сценариев](#примеры-сценариев)
- [Команды Quick Reference](#команды-quick-reference)
- [Troubleshooting](#troubleshooting)

---

## 🛠 Ежедневная Разработка

### 1. Создание Feature/Fix Branch

```bash
# Для новой функциональности
git checkout develop
git pull origin develop
git checkout -b feature/название-фичи

# Для исправления бага
git checkout develop
git pull origin develop
git checkout -b fix/название-бага
```

### 2. Разработка

Делайте изменения в коде как обычно.

### 3. Создание Changeset

**ВАЖНО:** Создавайте changeset ТОЛЬКО если:

- Изменения затрагивают функциональность пакета
- Требуется обновление версии

**НЕ нужен changeset для:**

- Изменений в документации
- Обновлений в тестах (без изменения функциональности)
- Рутинных задач (chore)

**Создание changeset:**

```bash
npm run changeset
```

Интерактивный промпт спросит:

#### Шаг 1: Выбор пакетов

```
? Which packages would you like to include?
  [ ] @yshvydak/server
  [ ] @yshvydak/web
  [ ] playwright-dashboard-reporter
```

**Выберите ТОЛЬКО те пакеты, которые изменили.**

Например:

- Изменения только в dashboard → выберите `server` и `web`
- Изменения только в reporter → выберите `playwright-dashboard-reporter`
- Изменения в обоих → выберите все три

#### Шаг 2: Тип изменения

Для каждого выбранного пакета:

```
? What kind of change is this for @yshvydak/server?
  [ ] major - Breaking change (1.0.0 → 2.0.0)
  [ ] minor - New feature (1.0.0 → 1.1.0)
  [ ] patch - Bug fix (1.0.0 → 1.0.1)
```

**Когда использовать:**

- **major (мажорная)** - BREAKING CHANGE
    - Изменили API (удалили/переименовали эндпоинты)
    - Изменили формат данных (несовместимый с предыдущей версией)
    - Требуется миграция для пользователей

- **minor (минорная)** - Новая функциональность
    - Добавили новую фичу
    - Добавили новый API endpoint
    - Улучшили существующую функциональность
    - Обратная совместимость сохранена

- **patch (патч)** - Исправление бага
    - Исправили баг
    - Улучшили производительность
    - Исправили опечатку в тексте

#### Шаг 3: Описание изменения

```
? Please enter a summary for this change (this will be written to the changelog).
  Submit empty line to open external editor
>
```

**Хорошие примеры:**

```
✅ Add bulk test rerun functionality with batch processing
✅ Fix WebSocket reconnection issue after network interruption
✅ Improve test filtering performance by 50%
```

**Плохие примеры:**

```
❌ Fixed bug
❌ Updated code
❌ Changes
```

**Правила для описания:**

- Пишите на английском языке
- Начинайте с глагола в настоящем времени (Add, Fix, Improve, Update)
- Будьте конкретны - описывайте ЧТО изменилось
- Можете добавить детали в следующих строках

**Результат:**

Создастся файл `.changeset/random-name-abc123.md` с вашими изменениями.

### 4. Коммит с Conventional Commits

```bash
git add .
git commit -m "feat(server): add bulk test rerun functionality"
```

**Формат:**

```
type(scope): subject

[опционально: body]

[опционально: footer]
```

**Типы (type):**

- `feat:` - новая функциональность
- `fix:` - исправление бага
- `docs:` - изменения в документации
- `chore:` - рутинные задачи (build, deps)
- `refactor:` - рефакторинг
- `test:` - тесты
- `perf:` - улучшения производительности

**Scope:**

- `server` - изменения в packages/server
- `web` - изменения в packages/web
- `reporter` - изменения в packages/reporter
- `dashboard` - изменения в server + web
- `*` - изменения во всём проекте

**Примеры:**

```bash
git commit -m "feat(reporter): add video attachment support"
git commit -m "fix(server): resolve database connection issue"
git commit -m "docs: update QUICKSTART.md with new setup steps"
git commit -m "chore(deps): update playwright to 1.55.0"
```

### 5. Push и Pull Request

```bash
git push origin feature/название-фичи
```

Создайте Pull Request в `develop` через GitHub UI.

---

## 📦 Процесс Релиза

Когда накопились изменения и готовы к релизу:

### Шаг 1: Проверка что будет релизнуто

```bash
git checkout develop
git pull origin develop

npm run changeset:status
```

Вы увидите список пакетов и версий, которые будут обновлены.

### Шаг 2: Мёрдж в Main

```bash
git checkout main
git pull origin main
git merge develop

# Решите конфликты если есть
git push origin main
```

**ВАЖНО:** Пуш в `main` триггернёт n8n webhook и задеплоит dashboard!

### Шаг 3: Применение Changesets

```bash
git checkout main
npm run version
```

**Что произойдёт:**

1. Changesets прочитает все `.changeset/*.md` файлы
2. Обновит `package.json` версии для затронутых пакетов
3. Создаст или обновит `CHANGELOG.md` для каждого пакета
4. Удалит использованные `.changeset/*.md` файлы

**Пример вывода:**

```
🦋  All files have been updated. Review them and commit at your leisure
🦋  info @yshvydak/server: 1.0.0 => 1.1.0
🦋  info @yshvydak/web: 1.0.0 => 1.1.0
🦋  info playwright-dashboard-reporter: 1.0.3 => 1.0.4
```

### Шаг 4: Ревью изменений

```bash
git status
git diff
```

**Проверьте:**

- Версии в `package.json` обновлены корректно
- `CHANGELOG.md` содержит правильные описания
- Удалены все changeset файлы

### Шаг 5: Коммит изменений

```bash
git add .
git commit -m "chore: release packages

- @yshvydak/server@1.1.0
- @yshvydak/web@1.1.0
- playwright-dashboard-reporter@1.0.4"
```

### Шаг 6: Создание Git Tags

```bash
# Если изменился dashboard (server/web)
git tag dashboard-v1.1.0 -m "Dashboard release 1.1.0"

# Если изменился reporter
git tag reporter-v1.0.4 -m "Reporter release 1.0.4"
```

### Шаг 7: Push с тегами

```bash
git push origin main --follow-tags
```

**ВАЖНО:** Этот пуш снова триггернёт n8n webhook, но это нормально - задеплоится обновлённая версия.

### Шаг 8: Публикация Reporter в NPM (если нужно)

**ТОЛЬКО если версия `playwright-dashboard-reporter` изменилась:**

```bash
npm run release:reporter
```

Или вручную:

```bash
cd packages/reporter
npm publish
```

**ВАЖНО:** Убедитесь что вы залогинены в NPM:

```bash
npm whoami  # Проверить текущий аккаунт
npm login   # Если не залогинены
```

### Шаг 9: Создание GitHub Release (опционально)

1. Перейдите на https://github.com/shvydak/yshvydak-test-dashboard/releases
2. Нажмите "Draft a new release"
3. Выберите тег (например, `dashboard-v1.1.0`)
4. Скопируйте содержимое из `CHANGELOG.md`
5. Опубликуйте

### Шаг 10: Синхронизация Develop

```bash
git checkout develop
git merge main
git push origin develop
```

---

## 📖 Примеры Сценариев

### Сценарий 1: Bug Fix в Dashboard (без reporter)

```bash
# 1. Создаём ветку
git checkout develop
git checkout -b fix/websocket-reconnection

# 2. Исправляем баг в packages/server/src/websocket.ts
# ... код ...

# 3. Создаём changeset
npm run changeset
# ? Which packages: [x] @yshvydak/server
# ? What kind: [x] patch
# ? Summary: Fix WebSocket reconnection after network interruption

# 4. Коммитим
git add .
git commit -m "fix(server): resolve WebSocket reconnection issue"

# 5. Push и PR
git push origin fix/websocket-reconnection
# Создать PR в develop через GitHub

# 6. После мёрджа PR - reporter версия НЕ изменится
```

**Результат после релиза:**

- server: 1.0.0 → 1.0.1
- web: без изменений
- reporter: без изменений

---

### Сценарий 2: Новая Фича в Reporter

```bash
# 1. Создаём ветку
git checkout develop
git checkout -b feat/video-attachments

# 2. Добавляем функциональность в packages/reporter/src/index.ts
# ... код ...

# 3. Создаём changeset
npm run changeset
# ? Which packages: [x] playwright-dashboard-reporter
# ? What kind: [x] minor
# ? Summary: Add support for video attachments in test reports

# 4. Коммитим
git add .
git commit -m "feat(reporter): add video attachment support"

# 5. Push и PR
git push origin feat/video-attachments

# 6. После релиза - публикуем в NPM
npm run release:reporter
```

**Результат после релиза:**

- server: без изменений
- web: без изменений
- reporter: 1.0.3 → 1.1.0

---

### Сценарий 3: Фича затрагивает всё (Dashboard + Reporter)

```bash
# 1. Создаём ветку
git checkout develop
git checkout -b feat/parallel-execution

# 2. Изменения в:
# - packages/reporter/src/index.ts (захват данных)
# - packages/server/src/services/test.service.ts (обработка)
# - packages/web/src/features/tests/TestList.tsx (отображение)

# 3. Создаём changeset
npm run changeset
# ? Which packages:
#   [x] @yshvydak/server
#   [x] @yshvydak/web
#   [x] playwright-dashboard-reporter
# ? What kind for server: [x] minor
# ? What kind for web: [x] minor
# ? What kind for reporter: [x] minor
# ? Summary: Add support for parallel test execution tracking

# 4. Коммитим
git add .
git commit -m "feat: add parallel test execution support

- Reporter: capture parallel execution metadata
- Server: process and store parallel test data
- Web: display parallel execution status"

# 5. Push и PR
git push origin feat/parallel-execution

# 6. После релиза - публикуем reporter
npm run release:reporter
```

**Результат после релиза:**

- server: 1.0.0 → 1.1.0
- web: 1.0.0 → 1.1.0
- reporter: 1.0.3 → 1.1.0

---

### Сценарий 4: Breaking Change (Major Version)

```bash
# 1. Создаём ветку
git checkout develop
git checkout -b refactor/api-v2

# 2. Изменяем API endpoints (несовместимые изменения)
# - Переименовали /api/tests → /api/v2/tests
# - Изменили формат ответа

# 3. Создаём changeset
npm run changeset
# ? Which packages: [x] @yshvydak/server
# ? What kind: [x] major  ⚠️ BREAKING CHANGE
# ? Summary: Migrate to API v2 with new endpoint structure

BREAKING CHANGE: API endpoints moved to /api/v2/
- Renamed /api/tests to /api/v2/tests
- Changed response format for test results

# 4. Коммитим
git add .
git commit -m "refactor(server)!: migrate to API v2

BREAKING CHANGE: API endpoints moved to /api/v2/"

# 5. После релиза
# server: 1.0.0 → 2.0.0  ⚠️ MAJOR bump
```

---

## 🚀 Команды Quick Reference

```bash
# Создать changeset (интерактивно)
npm run changeset

# Посмотреть что будет релизнуто
npm run changeset:status

# Применить changesets (обновить версии)
npm run version

# Опубликовать reporter в NPM
npm run release:reporter

# Проверить NPM логин
npm whoami

# Залогиниться в NPM
npm login
```

---

## ❓ Troubleshooting

### Проблема: Забыл создать changeset

**Решение:**

```bash
# Создайте changeset сейчас
npm run changeset

# Закоммитьте changeset
git add .changeset/
git commit -m "chore: add missing changeset for previous changes"
git push
```

---

### Проблема: Создал changeset для неправильного пакета

**Решение:**

```bash
# Найдите файл changeset
ls .changeset/

# Удалите его
rm .changeset/random-name-abc123.md

# Создайте новый правильный
npm run changeset
```

---

### Проблема: Хочу отменить релиз

**Если ещё НЕ запушили:**

```bash
git reset HEAD~1  # Отменить последний коммит
git restore .     # Восстановить файлы
```

**Если УЖЕ запушили в main:**

```bash
# НЕ делайте git revert на main!
# Это триггернёт n8n деплой

# Вместо этого:
# 1. Создайте hotfix с откатом изменений
# 2. Сделайте новый релиз
```

---

### Проблема: NPM публикация не удалась

**Проверьте:**

```bash
# 1. Залогинены ли вы
npm whoami

# 2. Права на публикацию
npm owner ls playwright-dashboard-reporter

# 3. Версия уже существует?
npm view playwright-dashboard-reporter versions
```

**Решение:**

```bash
# Если версия уже существует, нужно:
# 1. Откатить версию в package.json
# 2. Создать новый changeset
# 3. Сделать новый релиз
```

---

### Проблема: Конфликт при мёрдже develop → main

**Решение:**

```bash
git checkout main
git merge develop

# Решите конфликты в файлах
# Обычно конфликты в:
# - package.json (версии)
# - CHANGELOG.md

# После решения:
git add .
git commit
git push origin main
```

---

## 📝 Checklist Перед Релизом

```markdown
- [ ] Все PR смёржены в develop
- [ ] Все changesets созданы
- [ ] Тесты прошли (npm test)
- [ ] Build успешный (npm run build)
- [ ] develop смёржен в main
- [ ] npm run version выполнен
- [ ] Версии в package.json корректны
- [ ] CHANGELOG.md содержит правильные описания
- [ ] Коммит "chore: release packages" создан
- [ ] Git теги созданы
- [ ] Запушено в main с тегами
- [ ] Reporter опубликован в NPM (если изменился)
- [ ] GitHub Release создан (опционально)
- [ ] main смёржен обратно в develop
```

---

## 🎯 Best Practices

### ✅ DO:

- Создавайте changeset для каждого значимого изменения
- Пишите понятные описания в changesets
- Используйте conventional commits
- Проверяйте `npm run changeset:status` перед релизом
- Создавайте Git теги для каждого релиза
- Синхронизируйте develop ← main после релиза

### ❌ DON'T:

- НЕ редактируйте версии в package.json вручную
- НЕ редактируйте CHANGELOG.md вручную
- НЕ удаляйте changesets до применения `npm run version`
- НЕ пушьте в main без PR (кроме релизных коммитов)
- НЕ забывайте публиковать reporter в NPM

---

## 📚 Полезные Ссылки

- [Changesets Documentation](https://github.com/changesets/changesets)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [NPM Publishing Guide](https://docs.npmjs.com/cli/v10/commands/npm-publish)

---

**Последнее обновление:** 17 ноября 2024
**Версия документа:** 1.0.0

---
name: new-setting
description: Add a new app_settings key end to end — repository getter/setter, service validation, controller, route, tests, and the web hook that reads it. Use when asked to add a configurable setting, a new key in app_settings, or a new toggle in the Settings modal.
argument-hint: [setting-name]
---

# Add an `app_settings` key: $ARGUMENTS

`app_settings` is a server-side key-value table. Defaults live in the repository getter, never in the schema — an absent row must return the default, not null.

Reference implementation: `git show 22f6237` (the `default_project_tab` key). Follow its shape.

## 1. Repository — `packages/server/src/repositories/settings.repository.ts`

Four edits in this one file:

1. Add the key constant next to the others at the top: `const MY_KEY = 'my_key'`. Use `snake_case` for the stored key.
2. Add `getMyThing()` / `setMyThing()` to the `ISettingsRepository` interface.
3. Implement the getter with `queryOne` and a `??` default:

```ts
async getMyThing(): Promise<string> {
    const row = await this.queryOne<AppSettingRow>(
        'SELECT key, value FROM app_settings WHERE key = ?',
        [MY_KEY]
    )
    return row?.value ?? ''   // <- the default lives HERE
}
```

4. Implement the setter as an UPSERT — never a bare UPDATE:

```ts
async setMyThing(value: string): Promise<void> {
    await this.execute(
        `
            INSERT INTO app_settings (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
        `,
        [MY_KEY, value]
    )
}
```

Only `execute` / `queryOne` / `queryAll` from `BaseRepository`. Never touch `dbManager` directly — a hook blocks it.

## 2. Service — `settings.service.ts`

This is where validation and reconciliation belong, not the controller. If the stored value can go stale (a project that no longer exists, a path that was deleted), check it here, log a warning, reset it, and return the default.

## 3. Controller — `settings.controller.ts`

Two arrow-function properties. Always `try/catch`, always `ResponseHelper`:

```ts
getMyThing = async (_req: ServiceRequest, res: Response): Promise<Response> => {
    try {
        const value = await this.settingsService.getMyThing()
        return ResponseHelper.success(res, {value})
    } catch (error) {
        Logger.error('Error getting my thing', error)
        return ResponseHelper.error(
            res,
            error instanceof Error ? error.message : 'Unknown error',
            'Failed to get my thing',
            500
        )
    }
}
```

Type-check the request body in the update handler and return `ResponseHelper.badRequest(res, '...')` on bad input.

## 4. Route — `settings.routes.ts`

```ts
router.get('/my-thing', settingsController.getMyThing)
router.put('/my-thing', settingsController.updateMyThing)
```

`kebab-case` in the URL, `snake_case` for the DB key. GET + PUT, not POST.

## 5. Tests — one file per layer

`settings.repository.test.ts`, `settings.service.test.ts`, `settings.controller.test.ts`. Use an in-memory DB: `new DatabaseManager(':memory:')` + `await dbManager.initialize()`. Cover: absent row returns the default, set-then-get round-trips, and whatever staleness rule the service applies.

## 6. Web side, if the setting is user-facing

A hook in `packages/web/src/hooks/`, plus a section in the Settings modal. Two things bite here:

- The Settings modal's hook instance is **separate** from `App.tsx`'s. `App.tsx` must call that hook's `reload()` when Settings closes, or the change looks stuck until a full page refresh.
- React Query hooks need `enabled: isAuthenticated`, and `App.tsx` must pass `isAuthenticated` through, or the server logs `WARN: No authentication provided` on startup.

## 7. Finish

Add the key to the `app_settings` list in `CLAUDE.md`, and document the two endpoints in `docs/API_REFERENCE.md`. Then run the checklist: `npm run format` → `type-check` → `lint:fix` → `test` → `build`.

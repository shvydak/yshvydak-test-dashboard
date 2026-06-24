---
paths:
    - 'packages/web/**'
---

# Frontend Rules (auto-loaded for packages/web/\*\*)

## Layout

- **ALWAYS verify both desktop and mobile** when changing layout/components. Mobile breakpoint is `md:` (768px).
- `flex-1` buttons inside `flex-wrap` container wrap into a column on mobile — use two-row responsive layout instead (`space-y-2 md:space-y-0 md:flex`).
- Footer `mt-X` inside `flex-col h-screen` eats height from `main` — avoid top margin on footer.
- Sticky filter bar pattern: make `main` `overflow-hidden flex flex-col`, filter bar `shrink-0`, content area `flex-1 overflow-y-auto`.
- Mobile swipe pills need `bg-white/40+` opacity — `bg-white/15` is invisible on dark backgrounds.
- All icons: use `lucide-react` (already installed). Never use emoji or unicode characters in UI.
- Edit tool fails on multi-byte emoji — use Python `open(f).read().replace(...)` to swap them.

## Settings form alignment

Use `grid` not `flex justify-between` — different label lengths break horizontal alignment:

```tsx
// WRONG — labels push inputs to different positions
<div className="flex items-center justify-between gap-3">

// RIGHT — inputs stay aligned regardless of label width
<div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2">
  <span>Label</span>
  <input className={compactInputClass} />
  <span className="w-14 text-right text-xs">unit</span>
  <Button size="sm">Action</Button>
</div>
```

## Search is a feature set

Always implement together: ESC (clear/blur) + X button + result count + URL persistence (`?q=`).  
`SearchInput` props: `onClear`, `resultCount`, `showShortcutHint`. Without them, search UX is incomplete.

## CSS tooltip on disabled buttons

Native `title` doesn't show on `disabled`. Use `group/noproject` + `group-hover/noproject:opacity-100`:

```tsx
<div className="relative inline-flex shrink-0 group/noproject">
    <Button disabled={!activeProject} ...>...</Button>
    {!activeProject && (
        <span className="pointer-events-none absolute top-full left-0 z-50 mt-3
            whitespace-nowrap rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium
            text-white opacity-0 shadow-xl transition-opacity group-hover/noproject:opacity-100
            dark:bg-primary-500">
            Select a project tab to run tests
            <span className="absolute -top-1.5 left-4 h-3 w-3 rotate-45 bg-primary-600 dark:bg-primary-500" />
        </span>
    )}
</div>
```

Use `top-full mt-3` (below button) — `bottom-full` goes behind the sticky Header.

## Programmatic focus — verify forwardRef chain

`Input` and `SearchInput` use `forwardRef`. If `ref.current` is `null`, check the entire chain (`atom → molecule → feature`). Every wrapper must also use `forwardRef`.

## URL param as a one-shot cross-page signal

For "navigate + side effect" (e.g. go to `/tests` and focus search): add `?signal=1`, handle in `useEffect`, then remove immediately with `setSearchParams(params, {replace: true})`.

```tsx
// App.tsx: navigate(`/tests?focusSearch=1`)
// TestsList.tsx:
useEffect(() => {
    if (searchParams.get('focusSearch') === '1') {
        searchInputRef.current?.focus()
        const params = new URLSearchParams(searchParams)
        params.delete('focusSearch')
        setSearchParams(params, {replace: true})
    }
}, [searchParams, setSearchParams])
```

## Hooks firing before authentication completes

Hooks called unconditionally in `App.tsx` fire before `checkAuth()` resolves → `WARN: No authentication provided` in server logs.

- React Query hooks: `enabled: isAuthenticated`
- `useEffect` hooks: `if (!isAuthenticated) return` as first line + add to deps
- Accept `isAuthenticated = true` param (default keeps Settings callers working)
- `App.tsx` must pass `isAuthenticated` to: `useDiskSpaceWarning`, `useCIAutoRun`, `useProjectTabs`

## Tests: useSearchParams requires MemoryRouter

Adding `useSearchParams` breaks existing tests: "may be used only in the context of a Router".  
Wrap in `<MemoryRouter initialEntries={['/?project=All_Tests']}>` and vary URL per test case.

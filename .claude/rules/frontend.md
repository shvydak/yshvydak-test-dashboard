---
paths:
    - 'packages/web/**'
---

# UI / Responsive Rules

- **ALWAYS verify both desktop and mobile** when changing layout/components. Mobile breakpoint is `md:` (768px).
- `flex-1` buttons inside `flex-wrap` container wrap into a column on mobile — use two-row responsive layout instead (`space-y-2 md:space-y-0 md:flex`).
- Footer `mt-X` inside `flex-col h-screen` eats height from `main` — avoid top margin on footer.
- Sticky filter bar pattern: make `main` `overflow-hidden flex flex-col`, filter bar `shrink-0`, content area `flex-1 overflow-y-auto`.
- Mobile swipe pills need `bg-white/40+` opacity — `bg-white/15` is invisible on dark backgrounds.
- All icons: use `lucide-react` (already installed). Never use emoji or unicode characters in UI.
- Edit tool fails on multi-byte emoji — use Python `open(f).read().replace(...)` to swap them.

# Dashboard Settings

## Overview

The YShvydak Test Dashboard implements a **centralized Settings modal** that consolidates dashboard configuration and common administrative actions. This feature provides a unified interface for managing theme preferences and performing system operations, replacing the previous Dashboard-specific action panel.

### Core Principle

**Users can access all dashboard settings and actions from a single, accessible location through the user menu.**

The system ensures that:

- Settings modal is accessible from anywhere via Header user menu
- Theme preferences are persisted across sessions
- Common actions (Discover Tests, Clear Data, Health Check) are consolidated
- Modal design is extensible for future settings
- Run All Tests action is moved to Tests page for better context

## Architecture

The Settings feature follows the project's **Feature-Based Architecture** with modular component design and reusable patterns.

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│  Header (User Menu)                                         │
│  - Settings button (⚙️ Settings)                            │
│  - onClick: opens SettingsModal                             │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  SettingsModal (Modal Container)                            │
│  - Full-screen overlay with backdrop                        │
│  - Scrollable content area                                  │
│  - Organized sections                                       │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ├──────────────────┬───────────────────┬─────────────────────────┐
                 ▼                  ▼                   ▼                         ▼
┌──────────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│ SettingsTheme        │  │ SettingsTest     │  │ SettingsActions  │  │ Future Sections      │
│ Section              │  │ Execution        │  │ Section          │  │ (Extensible)         │
│                      │  │ Section          │  │                  │  │                      │
│ - Auto/Light/Dark    │  │ - Max Workers    │  │ - Discover Tests │  │ - Notifications      │
│ - localStorage       │  │ - localStorage   │  │ - Health Check   │  │ - Display prefs      │
│ - useTheme hook      │  │ - usePlaywright  │  │ - Clear Data     │  │ - Export/Import      │
│                      │  │   Workers hook   │  │                  │  │                      │
└──────────────────────┘  └──────────────────┘  └──────────────────┘  └──────────────────────┘
```

### File Structure

```
packages/web/src/
├── hooks/
│   ├── useTheme.ts                                    # Theme management hook
│   └── usePlaywrightWorkers.ts                        # Playwright workers configuration hook
├── features/
│   └── dashboard/
│       └── components/
│           └── settings/
│               ├── SettingsModal.tsx                  # Main modal container
│               ├── SettingsSection.tsx                # Reusable section wrapper
│               ├── SettingsThemeSection.tsx           # Theme selector (Auto/Light/Dark)
│               ├── SettingsTestExecutionSection.tsx   # Test execution settings (max workers)
│               ├── SettingsDataRetentionSection.tsx   # Data cleanup controls
│               ├── SettingsActionsSection.tsx         # Admin actions
│               └── index.ts                           # Barrel export
└── shared/
    └── components/
        └── Header.tsx                                 # Settings button integration
```

## Theme System

### Theme Management Hook

**Location**: `packages/web/src/hooks/useTheme.ts`

The `useTheme` hook provides centralized theme management with three modes:

```typescript
export type ThemeMode = 'auto' | 'light' | 'dark'

interface UseThemeReturn {
    themeMode: ThemeMode // Current selected mode
    isDark: boolean // Current computed theme state
    setThemeMode: (mode: ThemeMode) => void
}

// Shared utility for theme application (exported for reuse)
export function applyThemeMode(themeMode: ThemeMode): void
```

**Features**:

- **Auto mode**: Follows system theme via `prefers-color-scheme` media query
- **Light mode**: Forces light theme regardless of system settings
- **Dark mode**: Forces dark theme regardless of system settings
- **Persistence**: Saves preference to `localStorage` with key `'theme'`
- **Reactive**: Automatically updates when system theme changes in Auto mode
- **DOM Integration**: Manages `dark` class on `<html>` element for Tailwind CSS
- **DRY Principle**: `applyThemeMode()` utility prevents code duplication (used by both hook and LoginPage)

### Theme Modes Explained

#### Auto Mode (Default)

```typescript
// Behavior
if (systemTheme === 'dark') {
    document.documentElement.classList.add('dark')
} else {
    document.documentElement.classList.remove('dark')
}

// Listens to system changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', handler)
```

#### Light Mode

```typescript
// Always light
document.documentElement.classList.remove('dark')
// Ignores system theme changes
```

#### Dark Mode

```typescript
// Always dark
document.documentElement.classList.add('dark')
// Ignores system theme changes
```

### Tailwind Configuration

**Location**: `packages/web/tailwind.config.js`

```javascript
export default {
    darkMode: 'class', // Changed from 'media' to support manual control
    // ... rest of config
}
```

**How it works**:

- `darkMode: 'class'` enables manual theme control via `dark` class
- All UI components use `dark:` variant for dark mode styles
- Theme changes apply instantly without page reload

### localStorage Structure

```typescript
{
  "theme": "auto" | "light" | "dark"  // Default: "auto"
}
```

## Settings Modal Components

### SettingsModal

**Location**: `packages/web/src/features/dashboard/components/settings/SettingsModal.tsx`

Main modal container with fixed header, scrollable content, and backdrop overlay.

**Props**:

```typescript
interface SettingsModalProps {
    isOpen: boolean
    onClose: () => void
}
```

**Features**:

- Full-screen overlay with semi-transparent backdrop
- Fixed header with title, description, and close button
- Scrollable content area with max-height constraint
- Organized sections with vertical spacing
- Click backdrop to close
- ESC key support (browser default)

### SettingsSection

**Location**: `packages/web/src/features/dashboard/components/settings/SettingsSection.tsx`

Reusable section wrapper for organizing settings groups.

**Props**:

```typescript
interface SettingsSectionProps {
    title: string
    description?: string
    children: ReactNode
}
```

**Features**:

- Consistent section styling
- Optional description text
- Bottom border separator (removed on last section)
- Responsive spacing

### SettingsThemeSection

**Location**: `packages/web/src/features/dashboard/components/settings/SettingsThemeSection.tsx`

Theme selector with three visual buttons.

**UI Design**:

```
┌─────────────────────────────────────────────────────────┐
│ Theme                                                    │
│ Choose your preferred theme or follow system settings   │
│                                                          │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│ │   🌓     │  │   ☀️     │  │   🌙     │              │
│ │   Auto   │  │  Light   │  │   Dark   │              │
│ └──────────┘  └──────────┘  └──────────┘              │
└─────────────────────────────────────────────────────────┘
```

**States**:

- **Selected**: Blue border, blue background, highlighted
- **Unselected**: Gray background, transparent border, hover effect

### SettingsTestExecutionSection

**Location**: `packages/web/src/features/dashboard/components/settings/SettingsTestExecutionSection.tsx`

Test execution configuration with Playwright workers control.

**UI Design**:

```
┌─────────────────────────────────────────────────────────┐
│ Test Execution                                           │
│ Configure test execution behavior                        │
│                                                          │
│ Maximum Workers: [2]  [Reset to default (2)]           │
│ Limit concurrent test execution (1-16 workers)          │
└─────────────────────────────────────────────────────────┘
```

**Features**:

- **Number Input**: Range 1-16 workers (default: 2)
- **Reset Button**: Restore default value (2 workers)
- **localStorage Persistence**: Saved with key `'playwright_workers'`
- **Real-time Updates**: Changes apply immediately to next test run
- **Validation**: Only accepts integer values within range

**Hook Integration**:

Uses `usePlaywrightWorkers()` hook that provides:

- `workers`: Current workers count (number)
- `setWorkers(count)`: Update workers count with validation
- `resetToDefault()`: Reset to default (2 workers)
- `isValid(count)`: Validate workers count (1-16 range)

**Backend Integration**:

Workers count is sent with all test execution API calls:

- `POST /api/tests/run-all` - Body: `{maxWorkers: 2}`
- `POST /api/tests/run-group` - Body: `{filePath: "...", maxWorkers: 2}`
- `POST /api/tests/:id/rerun` - Body: `{maxWorkers: 2}`

Backend adds `--workers=N` flag to Playwright CLI commands:

```bash
npx playwright test --workers=2 --reporter=...
```

### SettingsDataRetentionSection

**Location**: `packages/web/src/features/dashboard/components/settings/SettingsDataRetentionSection.tsx`

Controls for selective data cleanup to manage storage usage.

**UI Design**:

```
┌─────────────────────────────────────────────────────────┐
│ Data Retention                                          │
│ Manage historical data to save storage space            │
│                                                         │
│ Delete data older than: [ 30 ] days         [ Delete ]  │
│ ─────────────────────────────────────────────────────── │
│ Keep only the latest:   [ 20 ] runs/test    [ Prune  ]  │
└─────────────────────────────────────────────────────────┘
```

**Features**:

- **Date-Based Cleanup**: Deletes all executions older than X days.
- **Count-Based Retention**: Keeps only the top N most recent executions _per unique test_.
- **Safety**: Disabled when tests are running.
- **Feedback**: Shows success toast with deleted count and freed space (MB).

**Backend Integration**:

- Calls `POST /api/tests/cleanup`
- Payload: `{ type: 'date', value: isoDate }` or `{ type: 'count', value: number }`

### SettingsActionsSection

**Location**: `packages/web/src/features/dashboard/components/settings/SettingsActionsSection.tsx`

Common administrative actions moved from Dashboard.

**Actions**:

1. **🔍 Discover Tests** - Scans Playwright project for available tests
2. **🩺 Check API Health** - Opens API health endpoint in new tab
3. **🗑️ Clear All Data** - Deletes all test results and history (requires confirmation)

**Integration**:

- Uses existing `useTestsStore` for Discover Tests
- Uses existing `useDashboardActions` hook for Clear Data
- Reuses `Button` component with variants (primary/secondary/danger)
- Shows loading states during operations
- Disables actions when tests are running

## UI/UX Flow

### Opening Settings

1. **User clicks avatar/email in Header**
    - Dropdown menu opens
    - Shows: Email/Role, Settings button, Sign out button

2. **User clicks "⚙️ Settings"**
    - Menu closes automatically
    - Settings modal opens with backdrop
    - Modal displays centered with two sections

3. **Modal opened state**
    - Backdrop prevents interaction with page
    - Settings organized in sections:
        - Theme section (top)
        - Actions section (bottom)
    - Close button (X) in header
    - Click backdrop to close

### Changing Theme

1. **User opens Settings modal**
2. **User sees current theme highlighted** (e.g., Auto with blue border)
3. **User clicks different theme button** (e.g., Dark)
    - Button immediately highlighted
    - Theme applies instantly (no reload)
    - Choice saved to localStorage
    - Page updates with new theme
4. **User closes modal**
    - Theme persists on next visit

### Performing Actions

**Discover Tests**:

1. Click "🔍 Discover Tests"
2. Button shows "Discovering..." with loading spinner
3. Server scans Playwright project
4. Tests appear in Tests page
5. Button returns to normal state

**Clear All Data**:

1. Click "🗑️ Clear All Data"
2. Button shows "Clearing..." with loading spinner
3. All test results deleted from database
4. Dashboard updates with empty state
5. Button returns to normal state

## Tests Page Integration

### Run All Tests Button

**Location**: Moved from Dashboard to Tests page (`TestsListFilters.tsx`)

**New Position**: Left side of Tests page, with Expand All/Collapse All buttons

**Layout**:

```
┌─────────────────────────────────────────────────────────────────────┐
│ [▶️ Run All Tests] [Expand All] [Collapse All] [Search...] [Filters] │
└─────────────────────────────────────────────────────────────────────┘
```

**Rationale**:

- Better context: Users see tests they're about to run
- Proximity to results: Immediate feedback on Tests page
- Dashboard cleanup: Dashboard focuses on overview/stats
- Consistent UX: All test actions in one place

## Benefits

### For Users

✅ **Centralized Settings**: One location for all preferences and actions
✅ **Persistent Theme**: Theme choice remembered across sessions
✅ **Better Organization**: Dashboard no longer cluttered with actions
✅ **Contextual Actions**: Run tests where you see tests
✅ **Quick Access**: Settings available from Header (always visible)

### For Developers

✅ **Extensible Architecture**: Easy to add new settings sections
✅ **Reusable Components**: SettingsSection pattern for future features
✅ **Clean Separation**: Settings decoupled from Dashboard
✅ **DRY Principle**: Shared hooks and utilities
✅ **Type Safe**: Full TypeScript support

## Technical Implementation

### App.tsx Integration

```typescript
function App() {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)

    return (
        <div>
            <Header
                onOpenSettings={() => setIsSettingsOpen(true)}
                // ... other props
            />
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />
            {/* ... rest of app */}
        </div>
    )
}
```

### Header.tsx Integration

```typescript
export default function Header({onOpenSettings, ...props}) {
    const {isDark} = useTheme()  // Uses theme from hook

    return (
        <header>
            {/* User menu dropdown */}
            <div className="dropdown">
                {onOpenSettings && (
                    <button onClick={() => {
                        onOpenSettings()
                        setShowUserMenu(false)
                    }}>
                        ⚙️ Settings
                    </button>
                )}
                <button onClick={handleLogout}>Sign out</button>
            </div>
        </header>
    )
}
```

### Theme Persistence Flow

```
1. User selects theme → setThemeMode('dark')
2. Hook saves to localStorage → localStorage.setItem('theme', 'dark')
3. Hook applies to DOM → document.documentElement.classList.add('dark')
4. Tailwind applies dark: styles → UI updates instantly
5. Next visit → useState reads from localStorage → theme restored
```

### Login Page Theme Support

The login page implements **automatic theme detection before authentication** to ensure proper display for users with dark system themes.

**Implementation**: `LoginPage.tsx` uses the shared `applyThemeMode()` utility from `useTheme.ts`:

1. Reads saved theme preference from `localStorage` (if exists)
2. Calls `applyThemeMode(themeMode)` utility on component mount
3. The utility handles theme application:
    - `'dark'`: Adds `dark` class to `<html>` element
    - `'light'`: Removes `dark` class
    - `'auto'` (default): Checks system preference via `prefers-color-scheme` media query
4. Listens for system theme changes when in auto mode
5. Updates theme dynamically without page reload

**Benefits**:

- ✅ Dark mode works before login (respects system preference)
- ✅ Consistent theme experience across entire application
- ✅ Prevents white-background-with-dark-inputs issue on login page
- ✅ Saved theme preference persists across logout/login cycles
- ✅ **DRY principle**: Single source of truth for theme logic in `applyThemeMode()` utility

**Example Scenario**:

```
User with dark system theme → Visits login page
LoginPage calls: applyThemeMode('auto')
Utility detects: prefers-color-scheme: dark
Applies: document.documentElement.classList.add('dark')
Result: Login page displays with dark background and proper contrast
```

**Technical Note**: The `applyThemeMode()` utility is shared between `useTheme` hook and `LoginPage`, ensuring consistent behavior across authenticated and unauthenticated states without code duplication.

## Future Enhancements

### Planned Settings Sections

The architecture supports easy addition of new settings:

#### 1. Notification Preferences

```typescript
<SettingsSection title="Notifications">
    <Toggle label="Desktop notifications when tests complete" />
    <Toggle label="Sound effects for test failures" />
    <Select label="Notification frequency" options={...} />
</SettingsSection>
```

#### 2. Display Preferences

```typescript
<SettingsSection title="Display">
    <Select label="Date format" options={['Relative', 'Absolute', 'Custom']} />
    <NumberInput label="Tests per page" min={10} max={200} />
    <Toggle label="Show test file paths" />
</SettingsSection>
```

#### 3. Test Filters Preferences

```typescript
<SettingsSection title="Default Filters">
    <Checkbox label="Auto-hide pending tests" />
    <Checkbox label="Auto-expand failed groups" />
    <Select label="Default view mode" options={['Grouped', 'Flat']} />
</SettingsSection>
```

#### 4. Export/Import Settings

```typescript
<SettingsSection title="Configuration">
    <Button onClick={exportSettings}>Export Settings</Button>
    <Button onClick={importSettings}>Import Settings</Button>
    <Button onClick={resetToDefaults}>Reset to Defaults</Button>
</SettingsSection>
```

### Implementation Pattern

All future sections follow the same pattern:

```typescript
<SettingsSection
    title="Section Title"
    description="Optional description">
    {/* Section-specific controls */}
</SettingsSection>
```

## Troubleshooting

### Theme Not Persisting

**Symptom**: Theme resets to Auto on page reload

**Possible Causes**:

1. localStorage not available (private browsing)
2. localStorage being cleared by browser/extension

**Solution**: Check browser console for localStorage errors

### Settings Button Not Visible

**Symptom**: No Settings option in user menu

**Cause**: `onOpenSettings` prop not passed to Header

**Solution**: Verify App.tsx passes `onOpenSettings` to Header component

### Theme Not Changing

**Symptom**: Clicking theme buttons has no effect

**Possible Causes**:

1. `useTheme` hook not used in Header
2. Tailwind config still set to `darkMode: 'media'`

**Solution**:

- Ensure `tailwind.config.js` has `darkMode: 'class'`
- Verify Header uses `useTheme` hook

### Login Page Theme Issues

**Symptom**: Login page shows dark inputs on white background (or vice versa) when system theme is dark

**Cause**: Theme detection not working before authentication

**Solution**: Verify `LoginPage.tsx` uses the `applyThemeMode()` utility:

```typescript
import {applyThemeMode, type ThemeMode} from '@/hooks/useTheme'

useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as ThemeMode | null
    const themeMode = savedTheme || 'auto'

    // Use shared utility - no duplication!
    applyThemeMode(themeMode)

    if (themeMode === 'auto') {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        const handleChange = () => applyThemeMode('auto')
        mediaQuery.addEventListener('change', handleChange)
        return () => mediaQuery.removeEventListener('change', handleChange)
    }
}, [])
```

**Verification**:

- Check browser DevTools Elements tab - `<html>` element should have `class="dark"` when system is in dark mode
- Verify `applyThemeMode()` utility is exported from `useTheme.ts`
- Confirm no code duplication between `LoginPage` and `useTheme` hook

## Related Documentation

- [Architecture Overview](../ARCHITECTURE.md) - Feature-Based Architecture details
- [Authentication Implementation](./AUTHENTICATION_IMPLEMENTATION.md) - User authentication system
- [Development Guidelines](../DEVELOPMENT.md) - Development best practices
- [Code Optimization](./CODE_OPTIMIZATION.md) - Production-ready code standards

---

**Last Updated:** October 2025

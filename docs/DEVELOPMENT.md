# Development Guidelines

## Development Commands

### Root Level Commands (using Turborepo)

- `npm run build` - Build all packages
- `npm run dev` - Run all packages in development mode
- `npm run type-check` - TypeScript checking across all packages
- `npm run lint` - Lint all packages
- `npm run lint:fix` - Auto-fix ESLint issues across all files
- `npm run format` - Format all files with Prettier
- `npm run format:check` - Check formatting without making changes
- `npm run clean` - Clean build artifacts and turbo cache
- `npm run clear-data` - Interactive CLI to clear all test data

### Individual Package Development

**Core Package (types):**

```bash
cd packages/core
npm run build        # Build TypeScript types
npm run dev          # Watch mode
```

**Reporter Package (@yshvydak/playwright-reporter):**

```bash
cd packages/reporter
npm run build        # Build CJS/ESM bundles with TypeScript declarations
npm run dev          # Build and watch for changes
npm run type-check   # TypeScript validation
```

**Server Package (API):**

```bash
cd packages/server
npm run dev          # Start with auto-reload (uses tsx watch)
npm run build        # Build for production
npm run type-check   # TypeScript validation
npm run test         # Run Jest tests
npm run lint         # ESLint checking
npm run lint:fix     # Auto-fix ESLint issues
```

**Web Package (React app):**

```bash
cd packages/web
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run preview      # Preview production build
npm run type-check   # TypeScript validation
npm run lint         # ESLint checking
npm run lint:fix     # Auto-fix ESLint issues
```

## Adding New Features

### Backend Features (Server)

1. **New API endpoint**: Create method in appropriate Controller → Service → Repository
2. **New business logic**: Add to relevant Service class
3. **New database operations**: Extend Repository classes
4. **New utilities**: Add to `utils/` directory

### Frontend Features (Web)

Follow the **Feature-Based Architecture** pattern:

#### Creating a New Feature

1. **Create feature directory**: `src/features/{feature-name}/`
2. **Add subdirectories as needed**:
    ```
    features/{feature-name}/
    ├── components/       # Feature-specific components
    ├── hooks/           # Custom hooks for this feature
    ├── store/           # Zustand store (if needed)
    ├── types/           # TypeScript types/interfaces
    ├── utils/           # Helper functions
    ├── constants/       # Constants and enums
    └── index.ts         # Barrel export
    ```
3. **Export public API**: Use `index.ts` for barrel exports
4. **Use path aliases**: Import with `@features/{feature-name}`

#### Adding Components

**Component Size Rule**: Maximum 200 lines per file

1. **Small components (< 200 lines)**: Create in `features/{feature}/components/`
2. **Large components (> 200 lines)**: Split into smaller sub-components
    - Create subdirectory: `components/{component-name}/`
    - Break into focused pieces (Header, Content, Footer, etc.)
    - Each sub-component should be under 200 lines

**Example** (TestDetailModal split):

```
components/testDetail/
├── TestDetailModal.tsx      (95 lines - orchestrator)
├── TestDetailHeader.tsx     (42 lines)
├── TestDetailTabs.tsx       (47 lines)
├── TestOverviewTab.tsx      (162 lines - includes attachments section)
├── TestStepsTab.tsx         (49 lines)
├── AttachmentItem.tsx       (component for individual attachments)
└── AttachmentPreview.tsx    (preview modal for attachments)
```

#### Shared Components

For components used across multiple features:

1. **Atoms** (basic elements): `src/shared/components/atoms/`
    - Button, StatusIcon, LoadingSpinner, Badge
2. **Molecules** (simple combinations): `src/shared/components/molecules/`
    - Card, ActionButton, StatusBadge, SearchInput

#### Adding Custom Hooks

1. **Feature-specific hooks**: `features/{feature}/hooks/`
2. **Global hooks**: `src/hooks/` (e.g., useWebSocket)
3. **Export from feature**: Add to `hooks/index.ts`

#### State Management (Zustand)

1. **Feature-level stores**: Create in `features/{feature}/store/`
2. **Store naming**: `{feature}Store.ts` (e.g., `testsStore.ts`)
3. **Export from feature**: Add to feature's `index.ts`

**Example**:

```typescript
// features/tests/store/testsStore.ts
import {create} from 'zustand'
import {devtools} from 'zustand/middleware'

interface TestsState {
    tests: TestResult[]
    // ... state
    fetchTests: () => Promise<void>
    // ... actions
}

export const useTestsStore = create<TestsState>()(
    devtools((set, get) => ({
        // ... implementation
    }))
)
```

#### Utilities and Helpers

1. **Feature-specific utils**: `features/{feature}/utils/`
2. **Centralized utilities**: Avoid duplication - one source of truth
3. **Import from shared location**: Use existing utilities before creating new ones

**Example**:

```typescript
// features/tests/utils/formatters.ts
export function formatDuration(ms: number): string { ... }
export function getStatusIcon(status: string): string { ... }

// Import in components
import { formatDuration, getStatusIcon } from '@features/tests/utils'
```

#### Constants and Types

1. **Constants**: `features/{feature}/constants/` for enums, status icons, filter options
2. **Types**: `features/{feature}/types/` for TypeScript interfaces specific to feature
3. **Shared types**: Use `@yshvydak/core` for cross-package types

## Working with Services

- Controllers should be thin - delegate to Services
- Services contain business logic and orchestrate Repository calls
- Repositories handle only database operations
- Use dependency injection for testing and modularity

## Code Quality Standards

- **Best Practices Reference**: When editing any code, consult Context7 MCP documentation for current best practices and standards for the relevant technology, framework, or language being used.
- **Code comments**: Use English when writing comments, if needed.
- **Code Formatting**: Project uses Prettier for consistent code formatting across all files
    - Configuration: `.prettierrc` (tabWidth: 4, singleQuote: true, semi: false, printWidth: 100)
    - Auto-format on save is recommended (install Prettier extension in your editor)
    - Run `npm run format` to format all files manually
    - Run `npm run format:check` to verify formatting without changes
- **Linting**: ESLint v9 with Flat Config integrates Prettier for formatting errors
    - Configuration: `eslint.config.mjs` at root level
    - Includes TypeScript support and unused imports cleanup
    - Run `npm run lint:fix` to auto-fix linting issues

## Documentation Updates

- **IMPORTANT**: Claude Code is authorized to update this CLAUDE.md and README.md file when making significant changes to:
    - Architecture or system components
    - API endpoints or functionality
    - Configuration requirements
    - Development workflows or commands
- Updates should be concise and maintain the existing structure and style

## Configuration Management

- Environment variables in `config/environment.config.ts`
- Constants in `config/constants.ts`
- Type definitions in appropriate `types/*.types.ts`

## Testing Integration

### For Existing Playwright Projects

1. Install `@yshvydak/core` package
2. Copy the reporter file to project's test utilities
3. Add reporter to `playwright.config.ts`
4. Set `DASHBOARD_API_URL` environment variable if needed
5. Start dashboard server before running tests

## Development Best Practices

### Following Conventions

When making changes to files, first understand the file's code conventions. Mimic code style, use existing libraries and utilities, and follow existing patterns.

- NEVER assume that a given library is available, even if it is well known. Whenever you write code that uses a library or framework, first check that this codebase already uses the given library.
- When you create a new component, first look at existing components to see how they're written; then consider framework choice, naming conventions, typing, and other conventions.
- When you edit a piece of code, first look at the code's surrounding context (especially its imports) to understand the code's choice of frameworks and libraries.
- Always follow security best practices. Never introduce code that exposes or logs secrets and keys. Never commit secrets or keys to the repository.

### Code Style

- IMPORTANT: DO NOT ADD **_ANY_** COMMENTS unless asked
- Use TypeScript strict mode across all packages
- Follow existing patterns and conventions in the codebase
- Maintain consistency with existing code structure

### Frontend-Specific Best Practices

#### Path Aliases

Always use TypeScript path aliases for clean imports:

```typescript
// ✅ Good - Clean imports with aliases
import {useTestsStore} from '@features/tests/store/testsStore'
import {Button, Card} from '@shared/components'
import {config} from '@config/environment.config'

// ❌ Bad - Relative paths
import {useTestsStore} from '../../../features/tests/store/testsStore'
import {Button} from '../../shared/components/atoms/Button'
```

#### Component Organization

- **Keep components focused**: Each component should have a single responsibility
- **Split large components**: If over 200 lines, break into smaller pieces
- **Use composition**: Build complex UIs from simpler components

#### DRY Principle

- **Centralize utilities**: Create shared utilities in `features/{feature}/utils/`
- **Share constants**: Define once in `constants/`, use everywhere
- **Avoid code duplication**: Check existing utilities before creating new ones

#### State Management

- **Feature-level stores**: Each feature manages its own state
- **Use Zustand devtools**: Enable for debugging in development
- **Computed values**: Use functions like `getIsAnyTestRunning()` for derived state

#### Example Refactoring Process

**Before** (monolithic 577-line component):

```typescript
// TestDetailModal.tsx (577 lines)
// Everything in one file: state, tabs, attachments, steps...
```

**After** (modular component structure with 2 tabs):

```typescript
// TestDetailModal.tsx (95 lines - orchestrator)
export function TestDetailModal({ test, isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const { attachments, loading, error } = useTestAttachments(test?.id, isOpen)
  const { executions } = useTestExecutionHistory(test?.testId)

  return (
    <div className="modal">
      <TestDetailHeader testName={test.name} onClose={onClose} />
      <TestDetailTabs activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex">
        <div className="flex-1">
          {activeTab === 'overview' && (
            <TestOverviewTab
              test={test}
              attachments={attachments}
              attachmentsLoading={loading}
            />
          )}
          {activeTab === 'steps' && <TestStepsTab test={test} />}
        </div>
        <ExecutionSidebar executions={executions} />
      </div>
    </div>
  )
}

// Overview tab now includes attachments section + test information
// + ExecutionSidebar for always-visible history
// + useTestAttachments and useTestExecutionHistory hooks
// + attachment types and helpers
```

**Benefits**:

- ✅ Each file under 100 lines
- ✅ Single responsibility per component
- ✅ Reusable sub-components
- ✅ Easier to test and maintain
- ✅ Better code organization

## Related Documentation

- [Architecture Overview](./ARCHITECTURE.md)
- [Configuration Details](./CONFIGURATION.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [API Reference](./API_REFERENCE.md)
- [Attachment Management System](./features/PER_RUN_ATTACHMENTS.md)

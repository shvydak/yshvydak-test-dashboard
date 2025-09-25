# Development Guidelines

## Development Commands

### Root Level Commands (using Turborepo)

- `npm run build` - Build all packages
- `npm run dev` - Run all packages in development mode
- `npm run type-check` - TypeScript checking across all packages
- `npm run lint` - Lint all packages
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
```

**Web Package (React app):**

```bash
cd packages/web
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run preview      # Preview production build
npm run type-check   # TypeScript validation
npm run lint         # ESLint checking
```

## Adding New Features

1. **New API endpoint**: Create method in appropriate Controller → Service → Repository
2. **New business logic**: Add to relevant Service class
3. **New database operations**: Extend Repository classes
4. **New utilities**: Add to `utils/` directory

## Working with Services

- Controllers should be thin - delegate to Services
- Services contain business logic and orchestrate Repository calls
- Repositories handle only database operations
- Use dependency injection for testing and modularity

## Code Quality Standards

- **Best Practices Reference**: When editing any code, consult Context7 MCP documentation for current best practices and standards for the relevant technology, framework, or language being used.
- **Code comments**: Use English when writing comments, if needed.

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

- IMPORTANT: DO NOT ADD ***ANY*** COMMENTS unless asked
- Use TypeScript strict mode across all packages
- Follow existing patterns and conventions in the codebase
- Maintain consistency with existing code structure

## Related Documentation

- [Architecture Overview](./ARCHITECTURE.md)
- [Configuration Details](./CONFIGURATION.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [API Reference](./API_REFERENCE.md)
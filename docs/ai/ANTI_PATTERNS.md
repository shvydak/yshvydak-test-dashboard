# Common Anti-Patterns to Avoid

This document contains detailed examples of common anti-patterns in the YShvydak Test Dashboard project, with wrong vs. right code examples.

## Overview

Understanding what NOT to do is as important as knowing what to do. These anti-patterns have been identified from actual project history and code reviews.

---

## Backend Anti-Patterns

### 1. Bypassing Repository Layer

**Severity:** 🔴 Critical - Violates core architecture

**Wrong Approach:**
```typescript
// test.controller.ts
async someController(req: ServiceRequest, res: Response) {
    // ❌ Direct database access from controller
    await this.dbManager.run("UPDATE test_results SET status = ? WHERE id = ?", [
        'completed',
        testId
    ])

    // ❌ Skips service layer business logic
    // ❌ No validation or error handling
    // ❌ Bypasses repository abstraction
}
```

**Correct Approach:**
```typescript
// test.controller.ts
async someController(req: ServiceRequest, res: Response) {
    // ✅ Use full chain: Controller → Service → Repository
    await this.testService.updateTestStatus(testId, 'completed')

    // ✅ Service handles business logic
    // ✅ Repository handles database operations
    // ✅ Proper error handling at each layer
}

// test.service.ts
async updateTestStatus(testId: string, status: string): Promise<void> {
    // Business logic: validation, logging, etc.
    await this.testRepository.updateStatus(testId, status)
}

// test.repository.ts
async updateStatus(testId: string, status: string): Promise<void> {
    // Database operation only
    await this.execute(
        "UPDATE test_results SET status = ? WHERE id = ?",
        [status, testId]
    )
}
```

**Why This Matters:**
- Maintains separation of concerns
- Enables easier testing (mock service layer)
- Centralized business logic
- Consistent error handling

---

### 2. UPDATE-ing Test Results (Destroys History)

**Severity:** 🔴 Critical - Breaks historical tracking

**Wrong Approach:**
```typescript
// database.manager.ts
async saveTestResult(testData: TestResultData): Promise<string> {
    // Check if test already exists
    const existingResult = await this.get(
        "SELECT * FROM test_results WHERE test_id = ?",
        [testData.testId]
    )

    if (existingResult) {
        // ❌ UPDATE destroys execution history
        await this.run(
            "UPDATE test_results SET status = ?, duration = ?, updated_at = ? WHERE test_id = ?",
            [testData.status, testData.duration, new Date().toISOString(), testData.testId]
        )
        return existingResult.id
    }

    // Only INSERT for first run
    const insertSql = `INSERT INTO test_results (...) VALUES (...)`
    await this.run(insertSql, [testData.id, ...])
    return testData.id
}
```

**Correct Approach:**
```typescript
// database.manager.ts
async saveTestResult(testData: TestResultData): Promise<string> {
    // ✅ ALWAYS INSERT, never UPDATE
    const insertSql = `
        INSERT INTO test_results
        (id, run_id, test_id, name, file_path, status, duration, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `

    await this.run(insertSql, [
        testData.id,           // Unique execution ID (UUID from reporter)
        testData.runId,
        testData.testId,       // Stable test identifier (hash-based)
        testData.name,
        testData.filePath,
        testData.status,
        testData.duration,
        new Date().toISOString()
    ])

    return testData.id
}
```

**Database Structure:**
```sql
-- Multiple rows with same testId = execution history
id (UUID)          | testId (hash)  | status  | created_at
-------------------|----------------|---------|-------------------
abc-123-def        | test-66jqtq    | passed  | 2025-10-09 10:00
xyz-456-uvw        | test-66jqtq    | failed  | 2025-10-09 11:00
mno-789-pqr        | test-66jqtq    | passed  | 2025-10-09 12:00
```

**Why This Matters:**
- Preserves complete execution history
- Enables trend analysis and flaky test detection
- Each run has independent attachments
- No data loss on rerun

---

### 3. Different Test ID Algorithms

**Severity:** 🔴 Critical - Breaks historical tracking

**Wrong Approach:**
```typescript
// Reporter (packages/reporter/src/index.ts)
generateTestId(filePath: string, title: string): string {
    // ❌ Random ID - different every time
    return `test-${Math.random().toString(36).substr(2, 9)}`
}

// Discovery (packages/server/src/services/playwright.service.ts)
generateTestId(filePath: string, title: string): string {
    // ❌ Different algorithm than reporter
    return `test-${filePath}-${title}`.replace(/[^a-z0-9]/gi, '-')
}
```

**Result:** Same test gets different IDs, historical tracking broken!

**Correct Approach:**
```typescript
// IDENTICAL algorithm in both reporter AND discovery
// packages/reporter/src/index.ts
generateStableTestId(filePath: string, title: string): string {
    const content = `${filePath}:${title}`
    let hash = 0

    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash | 0  // Convert to 32-bit integer
    }

    return `test-${Math.abs(hash).toString(36)}`
}

// packages/server/src/services/playwright.service.ts
// ✅ SAME EXACT FUNCTION
generateStableTestId(filePath: string, title: string): string {
    // ... identical implementation
}
```

**Why This Matters:**
- Same test always gets same testId
- Historical tracking works correctly
- Discovery and execution results match
- Database queries by testId work reliably

---

### 4. Skipping Attachment Copy

**Severity:** 🟡 High - Breaks attachment viewing

**Wrong Approach:**
```typescript
// attachment.service.ts
async processAttachments(attachments: any[], testResultId: string) {
    const processed: AttachmentData[] = []

    for (const attachment of attachments) {
        // ❌ Just store Playwright's temp path
        processed.push({
            id: uuidv4(),
            testResultId,
            type: attachment.contentType,
            fileName: attachment.name,
            filePath: attachment.path,  // ❌ Playwright temp directory
            url: attachment.path         // ❌ Will be deleted on next run
        })
    }

    return processed
}
```

**Result:** Attachments work initially, but break after next test run (Playwright cleans temp dir)!

**Correct Approach:**
```typescript
// attachment.service.ts
async processAttachments(attachments: any[], testResultId: string) {
    const processed: AttachmentData[] = []

    for (const attachment of attachments) {
        if (attachment.name && attachment.path) {
            const sourceFilePath = attachment.path

            // ✅ Verify source file exists
            if (!fs.existsSync(sourceFilePath)) {
                console.warn(`Source file not found: ${sourceFilePath}`)
                continue
            }

            // ✅ Copy to permanent storage
            const copiedAttachment = await this.attachmentManager.copyPlaywrightAttachment(
                sourceFilePath,
                testResultId,
                this.mapContentTypeToDbType(attachment.contentType)
            )

            processed.push({
                id: copiedAttachment.id,
                testResultId,
                type: copiedAttachment.type,
                fileName: copiedAttachment.fileName,
                filePath: copiedAttachment.filePath,  // ✅ Permanent storage path
                fileSize: copiedAttachment.fileSize,
                mimeType: copiedAttachment.mimeType,
                url: copiedAttachment.url             // ✅ Permanent URL
            })
        }
    }

    return processed
}

// storage/attachmentManager.ts
async copyPlaywrightAttachment(
    sourceFilePath: string,
    testResultId: string,
    type: AttachmentType
): Promise<AttachmentMetadata> {
    // Create permanent directory
    const testDir = this.ensureTestDirectory(testResultId)
    // {OUTPUT_DIR}/attachments/{testResultId}/

    // Generate unique filename
    const fileName = this.generateFileName(type, path.basename(sourceFilePath))
    // video-1759177234271-k4bhye.webm

    const targetFilePath = path.join(testDir, fileName)

    // ✅ Copy file to permanent location
    await fs.promises.copyFile(sourceFilePath, targetFilePath)

    const stats = await fs.promises.stat(targetFilePath)

    return {
        id: uuidv4(),
        testResultId,
        type,
        fileName,
        filePath: targetFilePath,
        fileSize: stats.size,
        mimeType: this.getMimeType(targetFilePath),
        url: this.generateUrl(testResultId, fileName)
    }
}
```

**Why This Matters:**
- Attachments survive Playwright cleanup
- Each execution has isolated storage
- No conflicts between test runs
- Users can view historical attachments

---

## Frontend Anti-Patterns

### 1. Hardcoding Credentials

**Severity:** 🔴 Critical - Security vulnerability

**Wrong Approach:**
```typescript
// LoginPage.tsx
const LoginPage = () => {
    const [formData, setFormData] = useState({
        email: 'admin@admin.com',    // ❌ Hardcoded credentials
        password: 'qwe123',           // ❌ Committed to repository
    })

    // ❌ Credentials visible in browser DevTools
    // ❌ Security risk in production
    // ❌ Can't change without redeployment
}
```

**Correct Approach:**
```typescript
// LoginPage.tsx
const LoginPage = () => {
    const [formData, setFormData] = useState({
        email: '',        // ✅ Empty - user provides credentials
        password: '',     // ✅ No defaults
    })

    // ✅ Credentials come from user input
    // ✅ No security leak
    // ✅ Works for all environments
}

// Backend validates against environment variables
// .env
ADMIN_EMAIL=admin@admin.com
ADMIN_PASSWORD=secure-hashed-password
```

**Why This Matters:**
- No credential leaks in code
- Environment-specific credentials
- Production security
- Proper credential management

---

### 2. Duplicating Utility Logic

**Severity:** 🟡 High - Violates DRY principle

**Wrong Approach:**
```typescript
// TestDetailModal.tsx (45 lines of duplicated logic)
const TestDetailModal = ({test, isOpen, onClose}) => {
    const [webSocketUrl, setWebSocketUrl] = useState<string | null>(null)

    useEffect(() => {
        if (!isOpen) return

        // ❌ Duplicated JWT token extraction logic
        try {
            const authData = localStorage.getItem('_auth')
            if (authData) {
                const parsedAuth = JSON.parse(authData)
                let token = null

                if (parsedAuth?.auth?.token) {
                    token = parsedAuth.auth.token
                } else if (parsedAuth?.token) {
                    token = parsedAuth.token
                }

                if (token) {
                    const url = `${config.websocket.url}?token=${encodeURIComponent(token)}`
                    setWebSocketUrl(url)
                }
            }
        } catch (error) {
            console.error('WebSocket URL error', error)
        }
    }, [isOpen])
}

// App.tsx (same 45 lines duplicated)
// Dashboard.tsx (same logic again)
// ... duplicated in multiple places
```

**Correct Approach:**
```typescript
// features/authentication/utils/webSocketUrl.ts
// ✅ Single source of truth
export function getWebSocketUrl(includeAuth: boolean = true): string | null {
    if (!includeAuth) {
        return config.websocket.url
    }

    const token = getAuthToken()

    if (!token) {
        return null
    }

    return `${config.websocket.url}?token=${encodeURIComponent(token)}`
}

export function getAuthToken(): string | null {
    try {
        const authData = localStorage.getItem('_auth') || sessionStorage.getItem('_auth')
        if (!authData) return null

        const parsedAuth = JSON.parse(authData)
        return parsedAuth?.auth?.token || parsedAuth?.token || null
    } catch {
        return null
    }
}

// TestDetailModal.tsx
import {getWebSocketUrl} from '@/features/authentication/utils/webSocketUrl'

const TestDetailModal = ({test, isOpen, onClose}) => {
    // ✅ 1 line instead of 45
    const webSocketUrl = useMemo(() => getWebSocketUrl(true), [])
}

// App.tsx, Dashboard.tsx - same 1 line
```

**Benefits:**
- 45 lines → 1 line (45× reduction)
- Bugs fixed once, applied everywhere
- Easier to test
- Consistent behavior

---

### 3. Components Over 200 Lines

**Severity:** 🟡 Medium - Maintainability issue

**Wrong Approach:**
```typescript
// TestDetailModal.tsx - 577 lines
export function TestDetailModal({test, isOpen, onClose}) {
    // 100 lines of state management
    const [activeTab, setActiveTab] = useState('overview')
    const [attachments, setAttachments] = useState([])
    const [loading, setLoading] = useState(false)
    // ... many more states

    // 150 lines of effects and handlers
    useEffect(() => {
        // Fetch attachments
    }, [test.id])

    useEffect(() => {
        // WebSocket setup
    }, [isOpen])

    // ... many more effects

    // 327 lines of JSX with mixed concerns
    return (
        <div className="modal">
            {/* Header logic mixed with content */}
            {/* Tabs logic mixed with panels */}
            {/* Attachments UI mixed with history */}
            {/* All in one massive component */}
        </div>
    )
}
```

**Correct Approach:**
```typescript
// TestDetailModal.tsx - 95 lines (orchestrator)
export function TestDetailModal({test, isOpen, onClose}) {
    const [activeTab, setActiveTab] = useState<TabKey>('overview')
    const {attachments, loading, error} = useTestAttachments(test?.id, isOpen)
    const {executions} = useTestExecutionHistory(test?.testId)

    return (
        <ModalBackdrop isOpen={isOpen} onClose={onClose}>
            <div className="modal-content">
                <TestDetailHeader
                    testName={test.name}
                    onClose={onClose}
                />

                <TestDetailTabs
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                />

                <div className="flex">
                    <div className="flex-1">
                        {activeTab === 'overview' && (
                            <TestOverviewTab
                                test={test}
                                attachments={attachments}
                                loading={loading}
                            />
                        )}
                        {activeTab === 'steps' && (
                            <TestStepsTab test={test} />
                        )}
                    </div>

                    <ExecutionSidebar
                        executions={executions}
                        onSelectExecution={handleSelectExecution}
                    />
                </div>
            </div>
        </ModalBackdrop>
    )
}

// Separate focused components:
// TestDetailHeader.tsx - 42 lines
// TestDetailTabs.tsx - 47 lines
// TestOverviewTab.tsx - 162 lines
// TestStepsTab.tsx - 49 lines
// ExecutionSidebar.tsx - 85 lines
```

**Benefits:**
- Each component under 200 lines
- Single responsibility per component
- Easier to test individually
- Reusable sub-components
- Better code organization

---

### 4. Premature WebSocket Connection

**Severity:** 🟡 Medium - Causes connection failures

**Wrong Approach:**
```typescript
// App.tsx
const App = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    // ❌ Runs immediately on mount, before auth is ready
    const webSocketUrl = useMemo(() => getWebSocketUrl(true), [])

    // Auth check happens later
    useEffect(() => {
        checkAuth().then(isAuth => {
            setIsAuthenticated(isAuth)
            setIsLoading(false)
        })
    }, [])

    // ❌ WebSocket connects with null/invalid token
    useWebSocket(webSocketUrl)
}
```

**Result:** WebSocket fails to connect because token isn't available yet!

**Correct Approach:**
```typescript
// App.tsx
const App = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [webSocketUrl, setWebSocketUrl] = useState<string | null>(null)

    // First: Check authentication
    useEffect(() => {
        checkAuth().then(isAuth => {
            setIsAuthenticated(isAuth)
            setIsLoading(false)
        })
    }, [])

    // Then: Setup WebSocket URL after auth is ready
    useEffect(() => {
        if (isAuthenticated && !isLoading) {
            const url = getWebSocketUrl(true)  // ✅ Token now available
            setWebSocketUrl(url)
        } else {
            setWebSocketUrl(null)
        }
    }, [isAuthenticated, isLoading])

    // ✅ WebSocket connects only when ready
    useWebSocket(webSocketUrl)
}
```

**Why This Matters:**
- WebSocket connects successfully
- No failed connection attempts
- Proper authentication flow
- Better user experience

---

## Summary

### Critical Anti-Patterns (Must Avoid)

1. ❌ Bypassing Repository Layer → Always use Controller → Service → Repository
2. ❌ UPDATE-ing Test Results → Always INSERT for history preservation
3. ❌ Different Test ID Algorithms → Use identical hash in reporter and discovery
4. ❌ Hardcoding Credentials → Use environment variables only

### High Priority Anti-Patterns (Should Avoid)

5. ❌ Skipping Attachment Copy → Always copy to permanent storage
6. ❌ Duplicating Utility Logic → Create shared utilities (DRY)
7. ❌ Components Over 200 Lines → Split into focused components
8. ❌ Premature WebSocket Connection → Wait for authentication

---

## Related Documentation

- [CLAUDE.md](../../CLAUDE.md) - Quick reference with top 3 anti-patterns
- [docs/ARCHITECTURE.md](../ARCHITECTURE.md) - Layered architecture explanation
- [docs/DEVELOPMENT.md](../DEVELOPMENT.md) - Development best practices
- [docs/features/HISTORICAL_TEST_TRACKING.md](../features/HISTORICAL_TEST_TRACKING.md) - Why INSERT-only matters

---

**Last Updated:** October 2025
**Maintained by:** Yurii Shvydak

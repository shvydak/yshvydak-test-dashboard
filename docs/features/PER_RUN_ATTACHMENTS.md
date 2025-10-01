# Attachment Management System

## Overview

The YShvydak Test Dashboard implements a **permanent attachment storage system** that ensures test artifacts (videos, screenshots, traces, logs) remain accessible across multiple test runs. This system solves the critical problem of Playwright cleaning its temporary `test-results/` directory between test executions, which previously caused attachments to disappear.

### Core Principle

**Each test result maintains independent, persistent attachments stored in permanent dashboard storage.**

The system automatically copies attachment files from Playwright's temporary directory to permanent storage, ensuring that:

- Running Test B does not affect Test A's attachments
- Attachments remain accessible after page reloads
- Re-running a test cleanly replaces its old attachments
- Each test result has isolated file storage

## Problem Statement

### The Original Issue

Before implementing permanent storage, the dashboard exhibited a critical bug:

**Scenario:**

1. Run Test A → Attachments visible and playable
2. Run Test B → Attachments visible and playable
3. Open Test A again (without rerun) → **Attachments fail to load**
    - Video player shows media element but doesn't play
    - Trace download shows "Failed to download attachment"
    - Browser console: `404 Not Found` for attachment files

**Root Cause:**

The dashboard was storing direct references to Playwright's temporary `test-results/` directory:

```
{PLAYWRIGHT_PROJECT}/test-results/{test-name}-{hash}/{attachment-name}
```

Playwright automatically cleans this directory when running new tests, deleting files that previous tests depend on.

### The Solution

Implement **permanent attachment storage** with automatic file copying:

1. **Intercept Attachments**: When reporter sends attachment paths, copy files to permanent storage
2. **Isolated Storage**: Each test result gets unique directory: `{OUTPUT_DIR}/attachments/{testResultId}/`
3. **Unique Naming**: Files get timestamp + random suffix to prevent collisions
4. **Clean Replacement**: Re-running a test deletes old physical files before saving new ones
5. **Database Tracking**: Store permanent file paths and URLs in database

## Architecture

The attachment management system spans multiple architectural layers, following the project's Layered Architecture pattern.

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│  Playwright Reporter (External)                             │
│  - Detects attachments in test results                      │
│  - Sends attachment metadata + temp file paths to API       │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  API Controller (test.controller.ts)                        │
│  - POST /api/tests endpoint                                 │
│  - Receives test result + attachments from reporter         │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Service Layer (attachment.service.ts)                      │
│  - processAttachments(): Orchestrates file copying          │
│  - saveAttachmentsForTestResult(): Manages lifecycle        │
│  - Coordinates AttachmentManager + AttachmentRepository     │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ├──────────────────┬─────────────────────────┐
                 ▼                  ▼                         ▼
┌──────────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│ AttachmentManager    │  │ AttachmentRepo   │  │ DatabaseManager      │
│ (Storage)            │  │ (Data Access)    │  │ (Persistence)        │
│                      │  │                  │  │                      │
│ - Copy files         │  │ - CRUD ops       │  │ - SQLite operations  │
│ - Generate URLs      │  │ - URL handling   │  │ - CASCADE deletes    │
│ - Delete files       │  │ - Query DB       │  │ - Transactions       │
│ - Unique naming      │  │                  │  │                      │
└──────────────────────┘  └──────────────────┘  └──────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Permanent Storage (File System)                            │
│  {OUTPUT_DIR}/attachments/{testResultId}/{fileName}         │
└─────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Express Static Serving + JWT Auth                          │
│  app.use('/attachments', authMiddleware, express.static())  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React)                                           │
│  - Fetch attachments via API                                │
│  - Create blob URLs for protected files                     │
│  - Display in TestDetailModal                               │
│  - Handle video player, trace viewer, downloads             │
└─────────────────────────────────────────────────────────────┘
```

### Storage Layer (AttachmentManager)

**Location**: `packages/server/src/storage/attachmentManager.ts`

**Responsibilities**:

- Copy files from Playwright's temporary directory to permanent storage
- Generate unique file names with timestamp + random suffix
- Create test-result-specific subdirectories
- Delete attachment files for test result
- Determine MIME types from file extensions
- Generate URL paths for attachments

**Key Methods**:

```typescript
class AttachmentManager {
    // Copy file from Playwright temp dir to permanent storage
    async copyPlaywrightAttachment(
        sourceFilePath: string,
        testResultId: string,
        type: AttachmentType
    ): Promise<AttachmentMetadata>

    // Delete all attachment files for a test result
    async deleteTestAttachments(testResultId: string): Promise<number>

    // Generate URL path for attachment
    generateUrl(testResultId: string, fileName: string): string
    // Returns: /attachments/{testResultId}/{fileName}

    // Get absolute file system path
    getAttachmentPath(testResultId: string, fileName: string): string
}
```

### Service Layer (AttachmentService)

**Location**: `packages/server/src/services/attachment.service.ts`

**Responsibilities**:

- Orchestrate attachment processing workflow
- Coordinate AttachmentManager (file operations) and AttachmentRepository (database operations)
- Handle attachment lifecycle (create, retrieve, delete)
- Map content types to database types
- Error handling and logging

**Key Methods**:

```typescript
class AttachmentService implements IAttachmentService {
    /**
     * Processes raw attachments from Playwright reporter and copies files to permanent storage
     * @param attachments - Array of attachment objects from reporter containing file paths
     * @param testResultId - ID of the test result to link attachments to
     * @returns Array of processed attachment data with permanent file paths and URLs
     */
    async processAttachments(attachments: any[], testResultId: string): Promise<AttachmentData[]>

    /**
     * Saves attachments for a test result, handling cleanup of old attachments on rerun
     * @param testResultId - ID of the test result
     * @param attachments - Raw attachment data from Playwright reporter
     */
    async saveAttachmentsForTestResult(testResultId: string, attachments: any[]): Promise<void>

    /**
     * Retrieves all attachments for a test result with properly formatted URLs
     * @param testResultId - ID of the test result
     * @returns Array of attachments with URLs ready for frontend consumption
     */
    async getAttachmentsByTestResult(testResultId: string): Promise<AttachmentData[]>

    async getAttachmentById(attachmentId: string): Promise<AttachmentData | null>
}
```

### Repository Layer (AttachmentRepository)

**Location**: `packages/server/src/repositories/attachment.repository.ts`

**Responsibilities**:

- Database CRUD operations for attachments
- Query attachments by test result ID
- Handle URL format conversion (legacy vs new paths)
- Delete attachment records

**Key Methods**:

```typescript
class AttachmentRepository extends BaseRepository {
    async saveAttachment(attachmentData: AttachmentData): Promise<void>

    async getAttachmentsByTestResult(testResultId: string): Promise<AttachmentData[]>

    // Returns attachments with properly formatted URLs
    async getAttachmentsWithUrls(testResultId: string): Promise<AttachmentData[]>

    async deleteAttachmentsByTestResult(testResultId: string): Promise<void>

    async getAttachmentById(attachmentId: string): Promise<AttachmentData | null>
}
```

### Database Schema

**Location**: `packages/server/src/database/schema.sql`

```sql
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    test_result_id TEXT NOT NULL REFERENCES test_results(id) ON DELETE CASCADE,
    type TEXT CHECK(type IN ('video', 'screenshot', 'trace', 'log')) NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    mime_type TEXT,
    url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attachments_test_result_id ON attachments(test_result_id);
CREATE INDEX IF NOT EXISTS idx_attachments_type ON attachments(type);
```

**Key Features**:

- `ON DELETE CASCADE`: Automatically delete attachment records when test result is deleted
- Indexed by test_result_id for fast queries
- Stores both file_path (absolute) and url (relative)

## How It Works

### End-to-End Flow

#### 1. Test Execution & Reporter

```
Playwright Test Runs
  ↓
Reporter captures attachments
  ↓
Attachments saved to: {PLAYWRIGHT_PROJECT}/test-results/{test-name}-{hash}/
  - video.webm
  - screenshot.png
  - trace.zip
```

#### 2. Reporter Sends Data to Dashboard

```typescript
// External reporter (yshvydakReporter.ts)
const result = {
    testId: 'test-66jqtq',
    name: 'API - Change Action Status',
    status: 'passed',
    attachments: [
        {
            name: 'video',
            path: '/Users/.../test-results/api-change-action-abcd1234/video.webm',
            contentType: 'video/webm',
        },
        {
            name: 'trace',
            path: '/Users/.../test-results/api-change-action-abcd1234/trace.zip',
            contentType: 'application/zip',
        },
    ],
}

// POST to dashboard
await fetch(`${DASHBOARD_API_URL}/api/tests`, {
    method: 'POST',
    body: JSON.stringify(result),
})
```

#### 3. API Controller Receives Data

```typescript
// test.controller.ts
async saveTestResult(req: Request, res: Response): Promise<void> {
  const testData = req.body

  // Save test result to database
  const testResultId = await this.testService.saveTestResult(testData)

  // Process and save attachments
  if (testData.attachments?.length > 0) {
    await this.attachmentService.saveAttachmentsForTestResult(
      testResultId,
      testData.attachments
    )
  }
}
```

#### 4. Service Layer Orchestrates Processing

```typescript
// attachment.service.ts
async saveAttachmentsForTestResult(
  testResultId: string,
  attachments: any[]
): Promise<void> {
  // Step 1: Check for existing attachments
  const existingAttachments = await this.attachmentRepository
    .getAttachmentsByTestResult(testResultId)

  // Step 2: Delete old physical files if test is being rerun
  if (existingAttachments.length > 0) {
    try {
      await this.attachmentManager.deleteTestAttachments(testResultId)
    } catch (error) {
      console.error(`[AttachmentService] Failed to delete physical files:`, error)
    }
  }

  // Step 3: Delete old database records
  await this.attachmentRepository.deleteAttachmentsByTestResult(testResultId)

  // Step 4: Process new attachments (copy files to permanent storage)
  const processedAttachments = await this.processAttachments(
    attachments,
    testResultId
  )

  // Step 5: Save new attachment records to database
  for (const attachment of processedAttachments) {
    await this.attachmentRepository.saveAttachment(attachment)
  }
}
```

#### 5. File Copying to Permanent Storage

```typescript
// attachment.service.ts
async processAttachments(
  attachments: any[],
  testResultId: string
): Promise<AttachmentData[]> {
  const processedAttachments: AttachmentData[] = []

  for (const attachment of attachments) {
    if (attachment.name && attachment.path) {
      const sourceFilePath = attachment.path

      // Verify source file exists
      if (!fs.existsSync(sourceFilePath)) {
        console.warn(`[AttachmentService] Source file not found: ${sourceFilePath}`)
        continue
      }

      // Determine attachment type
      const attachmentType = this.mapContentTypeToDbType(
        attachment.contentType || '',
        attachment.name || ''
      ) as AttachmentType

      try {
        // Copy file to permanent storage
        const copiedAttachment = await this.attachmentManager
          .copyPlaywrightAttachment(
            sourceFilePath,
            testResultId,
            attachmentType
          )

        // Create database record
        const attachmentData: AttachmentData = {
          id: copiedAttachment.id,
          testResultId: testResultId,
          type: copiedAttachment.type as any,
          fileName: copiedAttachment.fileName,
          filePath: copiedAttachment.filePath,
          fileSize: copiedAttachment.fileSize,
          mimeType: copiedAttachment.mimeType,
          url: copiedAttachment.url
        }

        processedAttachments.push(attachmentData)
      } catch (error) {
        console.error(
          `[AttachmentService] Failed to copy attachment ${sourceFilePath}:`,
          error
        )
      }
    }
  }

  return processedAttachments
}
```

#### 6. Storage Manager Creates Permanent Copy

```typescript
// attachmentManager.ts
async copyPlaywrightAttachment(
  sourceFilePath: string,
  testResultId: string,
  type: AttachmentType
): Promise<AttachmentMetadata> {
  // Create test-specific directory
  const testDir = this.ensureTestDirectory(testResultId)
  // Example: {OUTPUT_DIR}/attachments/af679466-96f7-4a00-ad72-c02adc779fd8/

  // Generate unique filename with timestamp + random suffix
  const fileName = this.generateFileName(type, path.basename(sourceFilePath))
  // Example: video-1759177234271-k4bhye.webm

  const targetFilePath = path.join(testDir, fileName)
  // Example: {OUTPUT_DIR}/attachments/{testResultId}/video-1759177234271-k4bhye.webm

  // Copy file to permanent location
  await fs.promises.copyFile(sourceFilePath, targetFilePath)

  // Get file stats
  const stats = await fs.promises.stat(targetFilePath)
  const mimeType = this.getMimeType(targetFilePath)

  return {
    id: uuidv4(),
    testResultId,
    type,
    fileName,
    filePath: targetFilePath,
    fileSize: stats.size,
    mimeType,
    url: this.generateUrl(testResultId, fileName)
    // Returns: /attachments/{testResultId}/{fileName}
  }
}
```

#### 7. Database Persistence

```typescript
// attachment.repository.ts
async saveAttachment(attachmentData: AttachmentData): Promise<void> {
  const sql = `
    INSERT INTO attachments
    (id, test_result_id, type, file_name, file_path, file_size, mime_type, url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `

  await this.execute(sql, [
    attachmentData.id,
    attachmentData.testResultId,
    attachmentData.type,
    attachmentData.fileName,
    attachmentData.filePath,
    attachmentData.fileSize,
    attachmentData.mimeType || null,
    attachmentData.url
  ])
}
```

#### 8. Frontend Retrieval & Display

```typescript
// Frontend fetches test details
const response = await authFetch(`${API_BASE_URL}/tests/${testId}/attachments`)
const attachments = await response.json()

// Example attachment object:
{
  id: 'att_123',
  testResultId: 'af679466-96f7-4a00-ad72-c02adc779fd8',
  type: 'video',
  fileName: 'video-1759177234271-k4bhye.webm',
  filePath: '/Users/.../test-results/attachments/{testResultId}/video-1759177234271-k4bhye.webm',
  fileSize: 1048576,
  mimeType: 'video/webm',
  url: '/attachments/af679466-96f7-4a00-ad72-c02adc779fd8/video-1759177234271-k4bhye.webm'
}

// Create blob URL for protected file access
const blobUrl = await createProtectedFileURL(
  attachment.url,
  SERVER_URL
)

// Use in video player
<video src={blobUrl} controls />
```

## Storage Structure

### File System Organization

```
{OUTPUT_DIR}/                           # Default: test-results/
├── attachments/                        # Permanent attachment storage
│   ├── {testResultId-1}/              # Isolated directory per test result
│   │   ├── video-1759177234271-k4bhye.webm
│   │   ├── screenshot-1759177234280-abc123.png
│   │   └── trace-1759177234290-xyz789.zip
│   │
│   ├── {testResultId-2}/
│   │   ├── video-1759177240100-def456.webm
│   │   └── trace-1759177240110-ghi789.zip
│   │
│   └── {testResultId-3}/
│       └── screenshot-1759177250000-jkl012.png
│
└── test-results.db                     # SQLite database
```

### File Naming Convention

Attachments use unique file names to prevent collisions:

**Format**: `{type}-{timestamp}-{random}.{extension}`

**Examples**:

- `video-1759177234271-k4bhye.webm`
- `screenshot-1759177234280-abc123.png`
- `trace-1759177234290-xyz789.zip`

**Components**:

- `type`: Attachment type (video, screenshot, trace, log)
- `timestamp`: `Date.now()` in milliseconds
- `random`: 6-character alphanumeric string (`Math.random().toString(36).substring(2, 8)`)
- `extension`: Determined from source file

### URL Format

Attachments are served via Express static middleware with JWT authentication:

**URL Path**: `/attachments/{testResultId}/{fileName}`

**Example**: `/attachments/af679466-96f7-4a00-ad72-c02adc779fd8/video-1759177234271-k4bhye.webm`

**Serving Configuration**:

```typescript
// app.ts
app.use('/attachments', authMiddleware, express.static(attachmentsPath))
```

## Technical Implementation

### Service Integration

The AttachmentService is integrated into the dependency injection container and used by TestController:

```typescript
// ServiceContainer initialization
export class ServiceContainer {
    // Storage and Repositories
    private attachmentManager: AttachmentManager
    private attachmentRepository: AttachmentRepository

    // Services
    public attachmentService: AttachmentService

    constructor(dbManager: DatabaseManager) {
        this.attachmentManager = new AttachmentManager(config.storage.outputDir)
        this.attachmentRepository = new AttachmentRepository(dbManager)

        this.attachmentService = new AttachmentService(this.attachmentRepository)
    }
}

// TestController usage
export class TestController {
    constructor(
        private testService: ITestService,
        private attachmentService: IAttachmentService
    ) {}

    async saveTestResult(req: Request, res: Response): Promise<void> {
        const testData = req.body
        const testResultId = await this.testService.saveTestResult(testData)

        if (testData.attachments?.length > 0) {
            await this.attachmentService.saveAttachmentsForTestResult(
                testResultId,
                testData.attachments
            )
        }

        res.json(ResponseHelper.success({id: testResultId}))
    }
}
```

### Content Type Mapping

The service maps Playwright content types to database types:

```typescript
// attachment.service.ts
mapContentTypeToDbType(contentType: string, fileName: string): string {
  return FileUtil.mapContentTypeToDbType(contentType, fileName)
}

// file.util.ts
static mapContentTypeToDbType(contentType: string, fileName: string): string {
  if (contentType.includes('video')) return 'video'
  if (contentType.includes('image')) return 'screenshot'
  if (contentType.includes('zip') || fileName.includes('trace')) return 'trace'
  return 'log'
}
```

### MIME Type Detection

```typescript
// attachmentManager.ts
private getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()

  const mimeTypes: {[key: string]: string} = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.zip': 'application/zip',
    '.json': 'application/json',
    '.log': 'text/plain',
    '.txt': 'text/plain'
  }

  return mimeTypes[ext] || 'application/octet-stream'
}
```

### Cleanup on Rerun

When a test is rerun, the system cleanly replaces old attachments:

```typescript
// attachment.service.ts
async saveAttachmentsForTestResult(
  testResultId: string,
  attachments: any[]
): Promise<void> {
  // Check for existing attachments
  const existingAttachments = await this.attachmentRepository
    .getAttachmentsByTestResult(testResultId)

  // Delete old physical files
  if (existingAttachments.length > 0) {
    try {
      await this.attachmentManager.deleteTestAttachments(testResultId)
    } catch (error) {
      console.error(`[AttachmentService] Failed to delete physical files:`, error)
    }
  }

  // Delete old database records (CASCADE handles this)
  await this.attachmentRepository.deleteAttachmentsByTestResult(testResultId)

  // Process and save new attachments
  const processedAttachments = await this.processAttachments(
    attachments,
    testResultId
  )

  for (const attachment of processedAttachments) {
    await this.attachmentRepository.saveAttachment(attachment)
  }
}
```

### Frontend Protected File Access

The frontend creates blob URLs for authenticated file access:

```typescript
// authFetch.ts
export async function createProtectedFileURL(
  relativePath: string,
  baseUrl: string
): Promise<string> {
  // Normalize URL slashes
  const cleanPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const fullUrl = `${cleanBaseUrl}${cleanPath}`

  return downloadProtectedFile(fullUrl)
}

async function downloadProtectedFile(url: string): Promise<string> {
  const response = await authFetch(url)
  const blob = await response.blob()
  return URL.createObjectURL(blob)
}

// Usage in TestDetailModal
const blobUrl = await createProtectedFileURL(
  attachment.url,
  config.api.serverUrl
)

// Display in video player
<video src={blobUrl} controls />
```

## Test Scenarios

### Scenario 1: Running Different Tests

**User Actions**:

1. Run Test A (first time)
2. Run Test B (first time)
3. Open Test A modal (without rerun)

**System Behavior**:

**Test A Execution**:

```
1. Playwright creates: test-results/test-a-hash123/video.webm
2. Reporter sends to dashboard:
   POST /api/tests
   {
     testId: "test-a",
     attachments: [{ path: "test-results/test-a-hash123/video.webm" }]
   }
3. Dashboard copies file:
   test-results/test-a-hash123/video.webm
   → attachments/testResultId-A/video-1759177234271-k4bhye.webm
4. Database stores:
   url: /attachments/testResultId-A/video-1759177234271-k4bhye.webm
```

**Test B Execution**:

```
1. Playwright cleans test-results/ and creates: test-results/test-b-hash456/screenshot.png
2. Reporter sends to dashboard
3. Dashboard copies file:
   → attachments/testResultId-B/screenshot-1759177240100-abc123.png
4. Database stores separate record
```

**Test A Modal Opens**:

```
1. Frontend: GET /api/tests/testResultId-A/attachments
2. Database returns: url: /attachments/testResultId-A/video-1759177234271-k4bhye.webm
3. Frontend creates blob URL with JWT authentication
4. Video player loads and plays successfully ✓
```

**Result**: Test A attachments remain accessible because they're in permanent storage, independent of Playwright's test-results/ directory.

### Scenario 2: Re-running the Same Test

**User Actions**:

1. Run Test A (first time)
2. Run Test A (second time - rerun)
3. Open Test A modal

**System Behavior**:

**First Run**:

```
1. Files copied to: attachments/testResultId-A/
   - video-1759177234271-k4bhye.webm (3.5 MB)
   - trace-1759177234290-xyz789.zip (1.2 MB)
2. Database records created with these URLs
```

**Second Run (Rerun)**:

```
1. Reporter sends same testId but new attachments
2. Service detects existing attachments for testResultId-A
3. AttachmentManager.deleteTestAttachments(testResultId-A):
   - Deletes video-1759177234271-k4bhye.webm
   - Deletes trace-1759177234290-xyz789.zip
   - Removes directory if empty
4. Repository deletes old database records
5. New files copied to: attachments/testResultId-A/
   - video-1759180000000-new123.webm (4.1 MB)
   - trace-1759180000010-new456.zip (1.5 MB)
6. New database records created
```

**Test A Modal Opens**:

```
1. Frontend fetches attachments
2. Database returns NEW attachment URLs
3. Only new attachments displayed ✓
```

**Result**: Old attachments completely replaced, ensuring users always see the most recent test execution artifacts.

### Scenario 3: Multiple Concurrent Tests

**User Actions**:

1. Run all tests (80 tests in parallel)

**System Behavior**:

```
Each test result gets isolated storage:

attachments/
├── testResult-001/
│   └── video-1759177234271-aaa111.webm
├── testResult-002/
│   └── video-1759177234272-bbb222.webm
├── testResult-003/
│   └── screenshot-1759177234273-ccc333.png
...
└── testResult-080/
    └── trace-1759177234350-zzz999.zip

No collisions, no interference between tests.
```

## API Endpoints

### Get Test Attachments

**Endpoint**: `GET /api/tests/:id/attachments`

**Description**: Retrieve all attachments for a specific test result.

**Response**:

```json
{
    "status": "success",
    "data": [
        {
            "id": "att_123",
            "testResultId": "af679466-96f7-4a00-ad72-c02adc779fd8",
            "type": "video",
            "fileName": "video-1759177234271-k4bhye.webm",
            "filePath": "/absolute/path/to/attachments/af679466.../video-1759177234271-k4bhye.webm",
            "fileSize": 3670016,
            "mimeType": "video/webm",
            "url": "/attachments/af679466-96f7-4a00-ad72-c02adc779fd8/video-1759177234271-k4bhye.webm"
        },
        {
            "id": "att_124",
            "testResultId": "af679466-96f7-4a00-ad72-c02adc779fd8",
            "type": "trace",
            "fileName": "trace-1759177234290-xyz789.zip",
            "filePath": "/absolute/path/to/attachments/af679466.../trace-1759177234290-xyz789.zip",
            "fileSize": 1258291,
            "mimeType": "application/zip",
            "url": "/attachments/af679466-96f7-4a00-ad72-c02adc779fd8/trace-1759177234290-xyz789.zip"
        }
    ]
}
```

### Download Attachment File

**Endpoint**: `GET /attachments/:testResultId/:fileName`

**Description**: Download attachment file with JWT authentication.

**Headers**:

```
Authorization: Bearer {jwt-token}
```

**Response**: File stream with appropriate Content-Type header.

### Trace File Download (Special Authentication)

**Endpoint**: `GET /api/tests/traces/:attachmentId`

**Description**: Download trace file for Playwright Trace Viewer with query-based JWT authentication.

**Query Parameters**:

- `token` (required): JWT authentication token

**Example**:

```
GET /api/tests/traces/att_123?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Usage**:

```typescript
// Frontend constructs URL with token for Playwright Trace Viewer
const token = getAuthToken()
const traceURL = `${config.api.serverUrl}/api/tests/traces/${attachment.id}?token=${encodeURIComponent(token)}`
window.open(`https://trace.playwright.dev/?trace=${encodeURIComponent(traceURL)}`, '_blank')
```

## Backward Compatibility

### Legacy Path Support

The system maintains compatibility with old attachments that reference Playwright's `test-results/` directory:

```typescript
// attachment.repository.ts
async getAttachmentsWithUrls(testResultId: string): Promise<AttachmentData[]> {
  const attachments = await this.getAttachmentsByTestResult(testResultId)

  return attachments.map(attachment => {
    if (!attachment.url) {
      return {
        ...attachment,
        url: attachment.filePath
          ? FileUtil.convertToRelativeUrl(attachment.filePath)
          : ''
      }
    }

    // Check if URL is already in correct format (/attachments/...)
    // New copied attachments have correct URLs, legacy ones need conversion
    if (attachment.url.startsWith('/attachments/')) {
      return attachment  // Already correct, no conversion needed
    }

    // Legacy path - convert to relative URL
    return {
      ...attachment,
      url: attachment.filePath
        ? FileUtil.convertToRelativeUrl(attachment.filePath)
        : attachment.url
    }
  })
}
```

### URL Conversion Utility

```typescript
// file.util.ts
static convertToRelativeUrl(absolutePath: string): string {
  // Convert absolute file path to relative URL
  // Example: /Users/.../test-results/... → /test-results/...
  const segments = absolutePath.split('/')
  const outputDirIndex = segments.lastIndexOf('test-results')

  if (outputDirIndex !== -1) {
    return '/' + segments.slice(outputDirIndex).join('/')
  }

  return absolutePath
}
```

## Best Practices

### For Developers

1. **Always Use AttachmentService**: Never directly manipulate attachment files or database records. Use the service layer to ensure proper lifecycle management.

2. **Handle File Operation Errors**: File copying can fail (disk full, permissions, etc.). Always wrap in try-catch and log errors.

3. **Test Cleanup**: When deleting test results, the database `ON DELETE CASCADE` automatically removes attachment records, but physical files must be deleted explicitly.

4. **URL Generation**: Use AttachmentManager.generateUrl() for consistent URL format. Never construct URLs manually.

5. **MIME Type Validation**: Always validate file types and MIME types to prevent security issues.

### For Users

1. **Storage Management**: Attachments accumulate over time. Consider implementing periodic cleanup of old test results.

2. **Disk Space Monitoring**: Video files are large. Monitor available disk space in the OUTPUT_DIR.

3. **Backup Strategy**: Include the `attachments/` directory in backup procedures along with the database.

4. **Rerun Behavior**: Re-running a test completely replaces its attachments. Save important artifacts before rerunning.

## Troubleshooting

### Attachment Not Found (404)

**Symptom**: Browser console shows `404 Not Found` for attachment URLs.

**Possible Causes**:

1. File not copied to permanent storage (check server logs)
2. Incorrect URL format (missing `/attachments/` prefix)
3. File deleted but database record remains
4. Permissions issue accessing file

**Debug Steps**:

```bash
# Check if file exists
ls -la {OUTPUT_DIR}/attachments/{testResultId}/

# Check database record
sqlite3 test-results.db "SELECT * FROM attachments WHERE test_result_id = 'testResultId'"

# Check server logs for copy errors
grep "Failed to copy attachment" server.log

# Verify Express static serving
curl -H "Authorization: Bearer {token}" http://localhost:3001/attachments/{testResultId}/{fileName}
```

### Video Player Not Working

**Symptom**: Video element visible but playback fails.

**Possible Causes**:

1. Blob URL creation failed
2. Authentication token expired
3. MIME type incorrect
4. File corrupted during copy

**Debug Steps**:

```javascript
// Check blob URL creation
console.log('Blob URL:', blobUrl)

// Check authentication
const token = getAuthToken()
console.log('Token valid:', !!token)

// Check MIME type
console.log('Attachment MIME type:', attachment.mimeType)

// Verify file integrity
const response = await authFetch(attachment.url)
console.log('File size:', response.headers.get('content-length'))
```

### Trace Download Fails

**Symptom**: "Failed to download attachment" error for trace files.

**Possible Causes**:

1. Trace file not copied (check if exists on disk)
2. JWT token not included in trace viewer URL
3. Attachment type not 'trace' in database

**Debug Steps**:

```bash
# Check trace file exists
ls -la {OUTPUT_DIR}/attachments/{testResultId}/*.zip

# Check database type
sqlite3 test-results.db "SELECT type FROM attachments WHERE id = 'attachmentId'"

# Test trace endpoint
curl "http://localhost:3001/api/tests/traces/att_123?token={jwt-token}"
```

### Attachments Not Deleted on Rerun

**Symptom**: Old attachment files remain after rerunning test.

**Possible Causes**:

1. deleteTestAttachments() failed silently
2. File permissions prevent deletion
3. Files locked by another process

**Debug Steps**:

```bash
# Check for error logs
grep "Failed to delete physical files" server.log

# Check file permissions
ls -la {OUTPUT_DIR}/attachments/{testResultId}/

# Check if files locked
lsof | grep attachments
```

## Performance Considerations

### File Copy Performance

Large video files can take time to copy. The system handles this asynchronously:

```typescript
// attachment.service.ts
await fs.promises.copyFile(sourceFilePath, targetFilePath)
```

**Optimization Tips**:

1. Use fast storage (SSD) for OUTPUT_DIR
2. Limit video resolution/duration in Playwright config
3. Enable video compression in Playwright

### Database Query Optimization

Attachment queries are indexed for performance:

```sql
CREATE INDEX IF NOT EXISTS idx_attachments_test_result_id ON attachments(test_result_id);
```

**Query Performance**:

- `getAttachmentsByTestResult()`: O(log n) due to index
- Bulk operations use transactions for efficiency

### Storage Cleanup

Implement periodic cleanup to prevent disk space exhaustion:

```typescript
// Example cleanup service
async cleanupOldAttachments(daysToKeep: number = 30): Promise<void> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

  // Find old test results
  const oldTestResults = await this.testRepository.getTestResultsBefore(cutoffDate)

  for (const testResult of oldTestResults) {
    // Delete attachments
    await this.attachmentManager.deleteTestAttachments(testResult.id)
    await this.attachmentRepository.deleteAttachmentsByTestResult(testResult.id)
  }
}
```

## Related Documentation

- [Architecture Overview](../ARCHITECTURE.md) - System architecture and layered design
- [API Reference](../API_REFERENCE.md) - Complete API endpoint documentation
- [Authentication Implementation](./AUTHENTICATION_IMPLEMENTATION.md) - JWT-based file access protection
- [Development Guidelines](../DEVELOPMENT.md) - Development best practices and commands
- [Deployment Guide](../DEPLOYMENT.md) - Production deployment and configuration

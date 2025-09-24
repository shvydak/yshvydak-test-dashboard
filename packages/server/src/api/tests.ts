import {Router} from 'express'
import {v4 as uuidv4} from 'uuid'
import {spawn} from 'child_process'
import path from 'path'
import {getWebSocketManager} from '../websocket/server'

const router = Router()

// Helper function to map content type to database type
function mapContentTypeToDbType(contentType: string, fileName: string): string {
     if (
          contentType.startsWith('video/') ||
          fileName.endsWith('.webm') ||
          fileName.endsWith('.mp4')
     ) {
          return 'video'
     }
     if (
          contentType.startsWith('image/') ||
          fileName.endsWith('.png') ||
          fileName.endsWith('.jpg') ||
          fileName.endsWith('.jpeg')
     ) {
          return 'screenshot'
     }
     if (contentType.includes('zip') || fileName.endsWith('.zip')) {
          return 'trace'
     }
     if (
          contentType.startsWith('text/') ||
          fileName.endsWith('.log') ||
          fileName.endsWith('.txt')
     ) {
          return 'log'
     }

     // Fallback based on common attachment names from Playwright
     if (fileName === 'video') return 'video'
     if (fileName === 'screenshot') return 'screenshot'
     if (fileName === 'trace') return 'trace'

     return 'log' // Default fallback
}


// POST /api/tests/discovery - Discover all available tests
router.post('/discovery', async (req, res) => {
     try {
          const dbManager = req.dbManager
          const projectDir = req.config.playwright.projectDir

          console.log(`🔍 Discovering tests in: ${projectDir}`)

          // Use already generated JSON file for now (for testing)
          const fs = require('fs')
          let playwrightData

          try {
               const dataContent = fs.readFileSync(
                    '/tmp/test-discovery.json',
                    'utf8',
               )
               playwrightData = JSON.parse(dataContent)
          } catch (fileError) {
               // Fallback to running the command
               console.log('Using fallback spawn method...')
               return res.status(500).json({
                    success: false,
                    error: 'Discovery file not found - run discovery manually first',
                    message: 'Please run: cd /Users/y.shvydak/QA/probuild-qa && npx playwright test --list --reporter=json > /tmp/test-discovery.json',
               })
          }

          const discoveredTests = []

          // Extract all tests from the nested structure
          for (const suite of playwrightData.suites || []) {
               for (const subSuite of suite.suites || []) {
                    for (const spec of subSuite.specs || []) {
                         // Generate stable test ID (same as in reporter)
                         // Use full relative path like in reporter: e2e/tests/...
                         const fullFilePath = `e2e/tests/${spec.file}`
                         const content = `${fullFilePath}:${spec.title}`
                         let hash = 0
                         for (let i = 0; i < content.length; i++) {
                              const char = content.charCodeAt(i)
                              hash = (hash << 5) - hash + char
                              hash = hash & hash
                         }
                         const stableTestId = `test-${Math.abs(hash).toString(
                              36,
                         )}`

                         discoveredTests.push({
                              id: uuidv4(),
                              testId: stableTestId,
                              runId: null, // No run yet - this is discovery
                              name: spec.title,
                              filePath: fullFilePath,
                              status: 'pending' as any,
                              duration: 0,
                              errorMessage: undefined,
                              errorStack: undefined,
                              retryCount: 0,
                              metadata: JSON.stringify({
                                   line: spec.line || 0,
                                   playwrightId: spec.id || null,
                                   discoveredAt: new Date().toISOString(),
                              }),
                              timestamp: new Date().toISOString(),
                         })
                    }
               }
          }

          // Clear existing pending tests before adding discovered ones
          await dbManager.execute('DELETE FROM test_results WHERE status = ?', [
               'pending',
          ])

          // Save discovered tests to database
          let savedCount = 0
          for (const test of discoveredTests) {
               try {
                    const resultId = await dbManager.saveTestResult(test as any)
                    console.log(
                         `✅ Saved test: ${test.name} with ID: ${resultId}`,
                    )
                    savedCount++
               } catch (error) {
                    console.error(
                         `❌ Failed to save discovered test ${test.name}:`,
                         error,
                    )
               }
          }

          // Broadcast discovery update via WebSocket
          const wsManager = getWebSocketManager()
          if (wsManager) {
               wsManager.broadcast({
                    type: 'discovery:completed',
                    data: {
                         total: discoveredTests.length,
                         saved: savedCount,
                         timestamp: new Date().toISOString(),
                    },
               })
          }

          console.log(
               `✅ Discovered ${discoveredTests.length} tests, saved ${savedCount}`,
          )

          res.json({
               success: true,
               data: {
                    discovered: discoveredTests.length,
                    saved: savedCount,
                    timestamp: new Date().toISOString(),
               },
          })
     } catch (error) {
          console.error('Error during test discovery:', error)
          res.status(500).json({
               success: false,
               error: 'Test discovery failed',
               message:
                    error instanceof Error ? error.message : 'Unknown error',
          })
     }
})

// POST /api/tests/test-save - Test saving single test (for debugging)
router.post('/test-save', async (req, res) => {
     try {
          const dbManager = req.dbManager

          const testData = {
               id: uuidv4(),
               testId: 'test-debug-123',
               runId: '',
               name: 'Debug Test',
               filePath: 'debug/test.test.ts',
               status: 'pending' as any,
               duration: 0,
               errorMessage: undefined,
               errorStack: undefined,
               retryCount: 0,
               metadata: JSON.stringify({debug: true}),
               timestamp: new Date().toISOString(),
          }

          console.log('🔍 Attempting to save test:', testData)

          const resultId = await dbManager.saveTestResult(testData)
          console.log('✅ Test saved with ID:', resultId)

          res.json({
               success: true,
               data: {
                    resultId,
                    testData,
               },
          })
     } catch (error) {
          console.error('❌ Error saving test:', error)
          res.status(500).json({
               success: false,
               error: 'Failed to save test',
               message:
                    error instanceof Error ? error.message : 'Unknown error',
          })
     }
})

// POST /api/tests/run-all - Run all tests
router.post('/run-all', async (req, res) => {
     try {
          const dbManager = req.dbManager
          const projectDir = req.config.playwright.projectDir
          const runId = uuidv4()

          console.log(`🚀 Running all tests in: ${projectDir}`)

          // Create test run record
          await dbManager.createTestRun({
               id: runId,
               status: 'running',
               totalTests: 0, // Will be updated when tests complete
               passedTests: 0,
               failedTests: 0,
               skippedTests: 0,
               duration: 0,
               metadata: JSON.stringify({
                    type: 'run-all',
                    triggeredFrom: 'dashboard',
               }),
          })

          // Broadcast run start
          const wsManager = getWebSocketManager()
          if (wsManager) {
               wsManager.broadcast({
                    type: 'run:started',
                    data: {runId, type: 'run-all'},
               })
          }

          // Start Playwright with our reporter
          const playwrightArgs = [
               'playwright',
               'test',
               '--reporter=./e2e/testUtils/yshvydakReporter.ts',
          ]

          const testProcess = spawn('npx', playwrightArgs, {
               cwd: projectDir,
               stdio: 'inherit',
               env: {
                    ...process.env,
                    DASHBOARD_API_URL: 'http://localhost:3001',
               },
          })

          testProcess.on('close', (code) => {
               console.log(`📊 All tests completed with code: ${code}`)

               if (wsManager) {
                    wsManager.broadcast({
                         type: 'run:completed',
                         data: {runId, exitCode: code},
                    })
               }
          })

          res.json({
               success: true,
               data: {
                    runId,
                    message: 'All tests started',
                    timestamp: new Date().toISOString(),
               },
          })
     } catch (error) {
          console.error('Error running all tests:', error)
          res.status(500).json({
               success: false,
               error: 'Failed to run all tests',
               message:
                    error instanceof Error ? error.message : 'Unknown error',
          })
     }
})

// POST /api/tests/run-group - Run tests from a specific file/group
router.post('/run-group', async (req, res) => {
     try {
          const {filePath} = req.body
          if (!filePath) {
               return res.status(400).json({
                    success: false,
                    error: 'Missing filePath parameter',
               })
          }

          const dbManager = req.dbManager
          const projectDir = req.config.playwright.projectDir
          const runId = uuidv4()

          console.log(`🎯 Running tests from group: ${filePath}`)

          // Create test run record
          await dbManager.createTestRun({
               id: runId,
               status: 'running',
               totalTests: 0,
               passedTests: 0,
               failedTests: 0,
               skippedTests: 0,
               duration: 0,
               metadata: JSON.stringify({
                    type: 'run-group',
                    filePath,
                    triggeredFrom: 'dashboard',
               }),
          })

          // Broadcast run start
          const wsManager = getWebSocketManager()
          if (wsManager) {
               wsManager.broadcast({
                    type: 'run:started',
                    data: {runId, type: 'run-group', filePath},
               })
          }

          // Start Playwright for specific file
          // Handle both cases: filePath with or without 'e2e/tests/' prefix
          let testFilePath = filePath
          if (!filePath.startsWith('e2e/tests/')) {
               testFilePath = path.join('e2e/tests', filePath)
          }
          
          const playwrightArgs = [
               'playwright',
               'test',
               testFilePath,
               '--reporter=./e2e/testUtils/yshvydakReporter.ts',
          ]

          const testProcess = spawn('npx', playwrightArgs, {
               cwd: projectDir,
               stdio: 'inherit',
               env: {
                    ...process.env,
                    DASHBOARD_API_URL: 'http://localhost:3001',
               },
          })

          testProcess.on('close', (code) => {
               console.log(`📊 Group tests completed with code: ${code}`)

               if (wsManager) {
                    wsManager.broadcast({
                         type: 'run:completed',
                         data: {runId, exitCode: code, filePath, type: 'run-group'},
                    })
               }
          })

          res.json({
               success: true,
               data: {
                    runId,
                    filePath,
                    message: `Tests started for ${filePath}`,
                    timestamp: new Date().toISOString(),
               },
          })
     } catch (error) {
          console.error('Error running group tests:', error)
          res.status(500).json({
               success: false,
               error: 'Failed to run group tests',
               message:
                    error instanceof Error ? error.message : 'Unknown error',
          })
     }
})

// GET /api/tests - Get all test results
router.get('/', async (req, res) => {
     try {
          const {runId, status, limit = 100} = req.query
          const dbManager = req.dbManager

          let tests: any[] = []

          if (runId) {
               tests = await dbManager.getTestResultsByRun(runId as string)
          } else {
               // Get latest test results grouped by test_id
               const sql = `
                SELECT tr.*, 
                       a.id as attachment_id, a.type as attachment_type, a.url as attachment_url
                FROM test_results tr
                LEFT JOIN attachments a ON tr.id = a.test_result_id
                WHERE tr.id IN (
                    SELECT id FROM test_results tr2 
                    WHERE tr2.test_id = tr.test_id 
                    ORDER BY tr2.updated_at DESC 
                    LIMIT 1
                )
                ${status ? `AND tr.status = '${status}'` : ''}
                ORDER BY tr.updated_at DESC
                LIMIT ?
            `

               const rows = await dbManager.queryAll(sql, [
                    parseInt(limit as string),
               ])

               console.log(`🔍 API: Found ${rows.length} test result rows`)
               if (rows.length > 0) {
                    const firstRow = rows[0] as any
                    console.log(`🔍 API: First row sample:`, firstRow)
                    console.log(`🔍 API: Row keys:`, Object.keys(firstRow))
               }

               // Group attachments by test result
               const testsMap = new Map()
               rows.forEach((row: any) => {
                    if (!testsMap.has(row.id)) {
                         const {
                              attachment_id,
                              attachment_type,
                              attachment_url,
                              file_path,
                              error_message,
                              error_stack,
                              ...testData
                         } = row
                         // Convert snake_case to camelCase for frontend
                         testData.filePath = file_path
                         testData.errorMessage = error_message
                         testData.errorStack = error_stack
                         testData.createdAt = row.created_at
                         testData.updatedAt = row.updated_at
                         testData.attachments = []
                         testsMap.set(row.id, testData)
                    }

                    if (row.attachment_id) {
                         testsMap.get(row.id).attachments.push({
                              id: row.attachment_id,
                              type: row.attachment_type,
                              url: row.attachment_url,
                         })
                    }
               })

               tests = Array.from(testsMap.values())
          }

          res.json({
               success: true,
               data: tests,
               count: tests.length,
               timestamp: new Date().toISOString(),
          })
     } catch (error) {
          console.error('Error fetching tests:', error)
          res.status(500).json({
               success: false,
               error: 'Failed to fetch tests',
               message:
                    error instanceof Error ? error.message : 'Unknown error',
               timestamp: new Date().toISOString(),
          })
     }
})

// GET /api/tests/stats - Get database statistics
router.get('/stats', async (req, res) => {
     try {
          const dbManager = req.dbManager
          const stats = await dbManager.getDataStats()

          res.json({
               success: true,
               data: stats,
               timestamp: new Date().toISOString(),
          })
     } catch (error) {
          console.error('Error fetching stats:', error)
          res.status(500).json({
               success: false,
               error: 'Failed to fetch stats',
               message:
                    error instanceof Error ? error.message : 'Unknown error',
               timestamp: new Date().toISOString(),
          })
     }
})

// DELETE /api/tests/all - Clear all test data
router.delete('/all', async (req, res) => {
     try {
          const dbManager = req.dbManager

          // Get stats before clearing
          const statsBefore = await dbManager.getDataStats()

          // Clear all data
          await dbManager.clearAllData()

          res.json({
               success: true,
               message: 'All test data cleared successfully',
               statsBefore,
               timestamp: new Date().toISOString(),
          })
     } catch (error) {
          console.error('Error clearing test data:', error)
          res.status(500).json({
               success: false,
               error: 'Failed to clear test data',
               message:
                    error instanceof Error ? error.message : 'Unknown error',
               timestamp: new Date().toISOString(),
          })
     }
})

// POST /api/tests - Create a new test result
router.post('/', async (req, res) => {
     try {
          const dbManager = req.dbManager
          const testData = req.body

          // Validate required fields
          if (
               !testData.id ||
               !testData.testId ||
               !testData.runId ||
               !testData.name
          ) {
               return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: id, testId, runId, name',
                    timestamp: new Date().toISOString(),
               })
          }

          const actualTestResultId = await dbManager.saveTestResult({
               id: testData.id,
               runId: testData.runId,
               testId: testData.testId,
               name: testData.name,
               filePath: testData.filePath || '',
               status: testData.status || 'unknown',
               duration: testData.duration || 0,
               errorMessage: testData.errorMessage || null,
               errorStack: testData.errorStack || null,
               retryCount: 0,
               metadata: testData.metadata || {},
          })

          // Save attachments if provided
          if (testData.attachments && Array.isArray(testData.attachments)) {
               // First, delete existing attachments for this test result to avoid duplicates
               await dbManager.execute(
                    'DELETE FROM attachments WHERE test_result_id = ?',
                    [actualTestResultId],
               )

               for (const attachment of testData.attachments) {
                    if (attachment.name && attachment.path) {
                         const attachmentType = mapContentTypeToDbType(
                              attachment.contentType || '',
                              attachment.name || '',
                         )

                         await dbManager.saveAttachment({
                              id: uuidv4(),
                              testResultId: actualTestResultId, // Use the actual ID from database
                              type: attachmentType as
                                   | 'video'
                                   | 'screenshot'
                                   | 'trace'
                                   | 'log',
                              fileName: attachment.name,
                              filePath: attachment.path,
                              fileSize: 0, // Will be calculated later
                              url: attachment.path,
                         })
                    }
               }
          }

          res.json({
               success: true,
               data: {id: testData.id},
               message: 'Test result saved successfully',
               timestamp: new Date().toISOString(),
          })
     } catch (error) {
          console.error('Error saving test result:', error)
          res.status(500).json({
               success: false,
               error: 'Failed to save test result',
               message:
                    error instanceof Error ? error.message : 'Unknown error',
               timestamp: new Date().toISOString(),
          })
     }
})

// GET /api/tests/:id - Get specific test result with attachments
router.get('/:id', async (req, res) => {
     try {
          const {id} = req.params
          const dbManager = req.dbManager

          const test = await dbManager.getTestResult(id)
          if (!test) {
               return res.status(404).json({
                    success: false,
                    error: 'Test not found',
                    timestamp: new Date().toISOString(),
               })
          }

          const attachments = await dbManager.getAttachmentsByTestResult(id)
          test.attachments = attachments

          res.json({
               success: true,
               data: test,
               timestamp: new Date().toISOString(),
          })
     } catch (error) {
          console.error('Error fetching test:', error)
          res.status(500).json({
               success: false,
               error: 'Failed to fetch test',
               message:
                    error instanceof Error ? error.message : 'Unknown error',
               timestamp: new Date().toISOString(),
          })
     }
})

// POST /api/tests/:id/rerun - Rerun a specific test
router.post('/:id/rerun', async (req, res) => {
     try {
          const {id} = req.params
          const dbManager = req.dbManager

          // Get the test to rerun
          const test = await dbManager.getTestResult(id)
          if (!test) {
               return res.status(404).json({
                    success: false,
                    error: 'Test not found',
                    timestamp: new Date().toISOString(),
               })
          }

          // Create a new run for this rerun
          const rerunId = uuidv4()
          await dbManager.createTestRun({
               id: rerunId,
               status: 'running',
               totalTests: 1,
               passedTests: 0,
               failedTests: 0,
               skippedTests: 0,
               duration: 0,
               metadata: {
                    type: 'rerun',
                    originalTestId: id,
                    originalTestName: test.name,
                    filePath: test.file_path,
               },
          })

          // Extract test file and test name for Playwright command
          const testFile = test.file_path
          const testName = test.name

          // Build Playwright command
          const playwrightCmd = 'npx'
          const playwrightArgs = [
               'playwright',
               'test',
               testFile,
               '--grep',
               testName,
               '--reporter=json,./e2e/testUtils/yshvydakReporter.ts',
          ]

          // Get the project directory from environment or default to current directory
          const projectDir = req.config.playwright.projectDir

          console.log(`🎭 Running Playwright in directory: ${projectDir}`)
          console.log(`🎯 Test file: ${testFile}`)
          console.log(`🔍 Test name: ${testName}`)

          // Spawn Playwright process
          const playwrightProcess = spawn(playwrightCmd, playwrightArgs, {
               cwd: projectDir,
               stdio: ['ignore', 'pipe', 'pipe'],
               env: {
                    ...process.env,
                    RERUN_MODE: 'true',
                    RERUN_ID: rerunId,
               },
          })

          let stdout = ''
          let stderr = ''

          playwrightProcess.stdout?.on('data', (data) => {
               stdout += data.toString()
          })

          playwrightProcess.stderr?.on('data', (data) => {
               stderr += data.toString()
          })

          playwrightProcess.on('close', async (code) => {
               try {
                    // Update run status
                    const runStatus = code === 0 ? 'completed' : 'failed'
                    await dbManager.updateTestRun(rerunId, {status: runStatus})

                    console.log(`Test rerun completed with code: ${code}`)
                    console.log('stdout:', stdout)
                    if (stderr) console.log('stderr:', stderr)

                    // Send WebSocket updates
                    const wsManager = getWebSocketManager()
                    if (wsManager) {
                         // Broadcast run completion
                         wsManager.broadcast({
                              type: 'run:completed',
                              data: {
                                   runId: rerunId,
                                   exitCode: code,
                                   testId: test.test_id,
                                   testName: test.name,
                                   originalTestId: id,
                                   isRerun: true,
                                   type: 'rerun'
                              },
                         })

                         // Broadcast general update to refresh dashboard
                         wsManager.broadcast({
                              type: 'dashboard:refresh',
                              data: {
                                   reason: 'test_rerun_completed',
                                   testId: test.test_id,
                                   runId: rerunId,
                                   status: runStatus,
                              },
                         })

                         console.log(
                              `📡 WebSocket updates sent for rerun: ${rerunId}`,
                         )
                    }

                    // Parse Playwright JSON output if available
                    if (stdout) {
                         try {
                              const lines = stdout
                                   .split('\n')
                                   .filter((line) => line.trim())
                              for (const line of lines) {
                                   try {
                                        const result = JSON.parse(line)
                                        if (result.type === 'test-end') {
                                             // Save the new test result
                                             const newTestResultId = uuidv4()
                                             await dbManager.saveTestResult({
                                                  id: newTestResultId,
                                                  runId: rerunId,
                                                  testId: test.test_id,
                                                  name: result.test.title,
                                                  filePath: test.file_path,
                                                  status: result.result.status,
                                                  duration:
                                                       result.result.duration,
                                                  errorMessage:
                                                       result.result.error
                                                            ?.message || null,
                                                  errorStack:
                                                       result.result.error
                                                            ?.stack || null,
                                                  retryCount:
                                                       (test.retry_count || 0) +
                                                       1,
                                                  metadata: {
                                                       isRerun: true,
                                                       originalTestId: id,
                                                  },
                                             })
                                        }
                                   } catch (e) {
                                        // Skip non-JSON lines
                                   }
                              }
                         } catch (e) {
                              console.error(
                                   'Error parsing Playwright output:',
                                   e,
                              )
                         }
                    }
               } catch (error) {
                    console.error('Error processing rerun results:', error)
               }
          })

          res.json({
               success: true,
               message: 'Test rerun started',
               rerunId,
               testId: id,
               testName: test.name,
               timestamp: new Date().toISOString(),
          })
     } catch (error) {
          console.error('Error starting test rerun:', error)
          res.status(500).json({
               success: false,
               error: 'Failed to start test rerun',
               message:
                    error instanceof Error ? error.message : 'Unknown error',
               timestamp: new Date().toISOString(),
          })
     }
})

// GET /api/tests/:id/history - Get test history (all runs of this test)
router.get('/:id/history', async (req, res) => {
     try {
          const {id} = req.params
          const {limit = 10} = req.query
          const dbManager = req.dbManager

          // Get the test to find its test_id
          const test = await dbManager.getTestResult(id)
          if (!test) {
               return res.status(404).json({
                    success: false,
                    error: 'Test not found',
                    timestamp: new Date().toISOString(),
               })
          }

          const history = await dbManager.getTestResultsByTestId(
               test.test_id,
               parseInt(limit as string),
          )

          res.json({
               success: true,
               data: history,
               count: history.length,
               testId: test.test_id,
               testName: test.name,
               timestamp: new Date().toISOString(),
          })
     } catch (error) {
          console.error('Error fetching test history:', error)
          res.status(500).json({
               success: false,
               error: 'Failed to fetch test history',
               message:
                    error instanceof Error ? error.message : 'Unknown error',
               timestamp: new Date().toISOString(),
          })
     }
})

// GET /api/tests/:id/attachments - Get attachments for a specific test result
router.get('/:id/attachments', async (req, res) => {
     try {
          const {id} = req.params
          const dbManager = req.dbManager

          // First check if test result exists
          const testResult = await dbManager.getTestResult(id)
          if (!testResult) {
               return res.status(404).json({
                    success: false,
                    error: 'Test result not found',
               })
          }

          // Get attachments for this test result using the correct ID
          const attachments = await dbManager.getAttachmentsByTestResult(id)

          // Convert file paths to HTTP URLs
          const attachmentsWithUrls = attachments.map((attachment) => ({
               ...attachment,
               // Convert absolute file path to relative HTTP URL
               url: attachment.file_path
                    ? attachment.file_path
                           .replace(
                                req.config.playwright.projectDir,
                                '',
                           )
                           .replace(/^\//, '') // Remove leading slash
                           .replace(/\\/g, '/') // Convert Windows paths
                    : attachment.url,
          }))

          res.json({
               success: true,
               data: attachmentsWithUrls,
          })
     } catch (error) {
          console.error('Error fetching test attachments:', error)
          res.status(500).json({
               success: false,
               error: 'Failed to fetch test attachments',
               details:
                    error instanceof Error ? error.message : 'Unknown error',
          })
     }
})

export default router

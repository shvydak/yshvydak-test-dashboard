import {Router} from 'express'

const router = Router()

// POST /api/runs - Create a new test run
router.post('/', async (req, res) => {
     try {
          const dbManager = req.dbManager
          const runData = req.body

          // Validate required fields
          if (!runData.id) {
               return res.status(400).json({
                    success: false,
                    error: 'Missing required field: id',
               })
          }

          const runId = await dbManager.createTestRun({
               id: runData.id,
               status: runData.status || 'running',
               totalTests: runData.totalTests || 0,
               passedTests: runData.passedTests || 0,
               failedTests: runData.failedTests || 0,
               skippedTests: runData.skippedTests || 0,
               duration: runData.duration || 0,
               metadata: runData.metadata || {},
          })

          res.json({
               success: true,
               data: {id: runId},
               message: 'Test run created successfully',
               timestamp: new Date().toISOString(),
          })
     } catch (error) {
          console.error('Error creating test run:', error)
          res.status(500).json({
               success: false,
               error: 'Failed to create test run',
               message:
                    error instanceof Error ? error.message : 'Unknown error',
               timestamp: new Date().toISOString(),
          })
     }
})

// GET /api/runs - Get all test runs
router.get('/', async (req, res) => {
     try {
          const {limit = 50, status} = req.query
          const dbManager = req.dbManager

          let runs: any[]

          if (status) {
               const sql =
                    'SELECT * FROM test_runs WHERE status = ? ORDER BY created_at DESC LIMIT ?'
               runs = await dbManager.queryAll(sql, [
                    status,
                    parseInt(limit as string),
               ])
          } else {
               runs = await dbManager.getAllTestRuns(parseInt(limit as string))
          }

          res.json({
               success: true,
               data: runs,
               count: runs.length,
               timestamp: new Date().toISOString(),
          })
     } catch (error) {
          console.error('Error fetching runs:', error)
          res.status(500).json({
               success: false,
               error: 'Failed to fetch runs',
               message:
                    error instanceof Error ? error.message : 'Unknown error',
               timestamp: new Date().toISOString(),
          })
     }
})

// GET /api/runs/stats - Get dashboard statistics (MUST be before /:id route)
router.get('/stats', async (req, res) => {
     try {
          const dbManager = req.dbManager
          const stats = await dbManager.getStats()

          // Get recent runs
          const recentRuns = await dbManager.getAllTestRuns(5)

          // Calculate success rate
          const successRate =
               stats.total_tests > 0
                    ? ((stats.total_passed / stats.total_tests) * 100).toFixed(
                           1,
                      )
                    : '0'

          res.json({
               success: true,
               data: {
                    ...stats,
                    success_rate: parseFloat(successRate),
                    recent_runs: recentRuns,
               },
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

// PUT /api/runs/:id - Update test run
router.put('/:id', async (req, res) => {
     try {
          const {id} = req.params
          const dbManager = req.dbManager
          const runData = req.body

          await dbManager.updateTestRun(id, {
               status: runData.status,
               totalTests: runData.totalTests,
               passedTests: runData.passedTests,
               failedTests: runData.failedTests,
               skippedTests: runData.skippedTests,
               duration: runData.duration,
               metadata: runData.metadata || {},
          })

          res.json({
               success: true,
               data: {id},
               message: 'Test run updated successfully',
               timestamp: new Date().toISOString(),
          })
     } catch (error) {
          console.error('Error updating test run:', error)
          res.status(500).json({
               success: false,
               error: 'Failed to update test run',
               message:
                    error instanceof Error ? error.message : 'Unknown error',
               timestamp: new Date().toISOString(),
          })
     }
})

// GET /api/runs/:id - Get specific test run with results
router.get('/:id', async (req, res) => {
     try {
          const {id} = req.params
          const dbManager = req.dbManager

          const run = await dbManager.getTestRun(id)
          if (!run) {
               return res.status(404).json({
                    success: false,
                    error: 'Test run not found',
                    timestamp: new Date().toISOString(),
               })
          }

          const testResults = await dbManager.getTestResultsByRun(id)

          // Add attachments to each test result
          for (const test of testResults) {
               test.attachments = await dbManager.getAttachmentsByTestResult(
                    test.id,
               )
          }

          res.json({
               success: true,
               data: {
                    run,
                    testResults,
                    testCount: testResults.length,
               },
               timestamp: new Date().toISOString(),
          })
     } catch (error) {
          console.error('Error fetching run:', error)
          res.status(500).json({
               success: false,
               error: 'Failed to fetch run',
               message:
                    error instanceof Error ? error.message : 'Unknown error',
               timestamp: new Date().toISOString(),
          })
     }
})

// DELETE /api/runs/:id - Delete a test run and its results
router.delete('/:id', async (req, res) => {
     try {
          const {id} = req.params
          const dbManager = req.dbManager

          // Check if run exists
          const run = await dbManager.getTestRun(id)
          if (!run) {
               return res.status(404).json({
                    success: false,
                    error: 'Test run not found',
                    timestamp: new Date().toISOString(),
               })
          }

          // Delete run (cascades to test_results and attachments)
          await dbManager.execute('DELETE FROM test_runs WHERE id = ?', [id])

          res.json({
               success: true,
               message: 'Test run deleted successfully',
               deletedRunId: id,
               timestamp: new Date().toISOString(),
          })
     } catch (error) {
          console.error('Error deleting run:', error)
          res.status(500).json({
               success: false,
               error: 'Failed to delete run',
               message:
                    error instanceof Error ? error.message : 'Unknown error',
               timestamp: new Date().toISOString(),
          })
     }
})

// POST /api/runs/cleanup - Cleanup old runs
router.post('/cleanup', async (req, res) => {
     try {
          const {daysToKeep = 30} = req.body
          const dbManager = req.dbManager

          await dbManager.cleanup(daysToKeep)

          res.json({
               success: true,
               message: `Cleaned up runs older than ${daysToKeep} days`,
               daysToKeep,
               timestamp: new Date().toISOString(),
          })
     } catch (error) {
          console.error('Error during cleanup:', error)
          res.status(500).json({
               success: false,
               error: 'Failed to cleanup old runs',
               message:
                    error instanceof Error ? error.message : 'Unknown error',
               timestamp: new Date().toISOString(),
          })
     }
})

export default router

import {Router} from 'express'
import path from 'path'
import fs from 'fs'

const router = Router()

// GET /api/attachments/:testResultId - Get attachments for a test result
router.get('/:testResultId', async (req, res) => {
     try {
          const {testResultId} = req.params
          const dbManager = req.dbManager

          const attachments = await dbManager.getAttachmentsByTestResult(
               testResultId,
          )

          res.json({
               success: true,
               data: attachments,
               count: attachments.length,
               testResultId,
               timestamp: new Date().toISOString(),
          })
     } catch (error) {
          console.error('Error fetching attachments:', error)
          res.status(500).json({
               success: false,
               error: 'Failed to fetch attachments',
               message:
                    error instanceof Error ? error.message : 'Unknown error',
               timestamp: new Date().toISOString(),
          })
     }
})

// GET /api/attachments/file/:id - Download attachment file
router.get('/file/:id', async (req, res) => {
     try {
          const {id} = req.params
          const dbManager = req.dbManager

          // Get attachment info from database
          const attachment = await dbManager.query(
               'SELECT * FROM attachments WHERE id = ?',
               [id],
          )

          if (!attachment) {
               return res.status(404).json({
                    success: false,
                    error: 'Attachment not found',
                    timestamp: new Date().toISOString(),
               })
          }

          const filePath = attachment.file_path

          // Check if file exists
          if (!fs.existsSync(filePath)) {
               return res.status(404).json({
                    success: false,
                    error: 'Attachment file not found on disk',
                    filePath,
                    timestamp: new Date().toISOString(),
               })
          }

          // Set appropriate headers
          res.setHeader(
               'Content-Type',
               attachment.mime_type || 'application/octet-stream',
          )
          res.setHeader(
               'Content-Disposition',
               `inline; filename="${attachment.file_name}"`,
          )

          // Stream the file
          const fileStream = fs.createReadStream(filePath)
          fileStream.pipe(res)

          fileStream.on('error', (error) => {
               console.error('Error streaming file:', error)
               if (!res.headersSent) {
                    res.status(500).json({
                         success: false,
                         error: 'Error streaming file',
                         message: error.message,
                         timestamp: new Date().toISOString(),
                    })
               }
          })
     } catch (error) {
          console.error('Error serving attachment:', error)
          res.status(500).json({
               success: false,
               error: 'Failed to serve attachment',
               message:
                    error instanceof Error ? error.message : 'Unknown error',
               timestamp: new Date().toISOString(),
          })
     }
})

// DELETE /api/attachments/:id - Delete an attachment
router.delete('/:id', async (req, res) => {
     try {
          const {id} = req.params
          const dbManager = req.dbManager

          // Get attachment info
          const attachment = await dbManager.query(
               'SELECT * FROM attachments WHERE id = ?',
               [id],
          )

          if (!attachment) {
               return res.status(404).json({
                    success: false,
                    error: 'Attachment not found',
                    timestamp: new Date().toISOString(),
               })
          }

          // Delete file from disk
          if (fs.existsSync(attachment.file_path)) {
               fs.unlinkSync(attachment.file_path)
          }

          // Delete from database
          await dbManager.deleteAttachment(id)

          res.json({
               success: true,
               message: 'Attachment deleted successfully',
               deletedAttachmentId: id,
               fileName: attachment.file_name,
               timestamp: new Date().toISOString(),
          })
     } catch (error) {
          console.error('Error deleting attachment:', error)
          res.status(500).json({
               success: false,
               error: 'Failed to delete attachment',
               message:
                    error instanceof Error ? error.message : 'Unknown error',
               timestamp: new Date().toISOString(),
          })
     }
})

// GET /api/attachments/stats/overview - Get attachment statistics
router.get('/stats/overview', async (req, res) => {
     try {
          const dbManager = req.dbManager

          const stats = await dbManager.query(`
            SELECT 
                COUNT(*) as total_attachments,
                COUNT(CASE WHEN type = 'video' THEN 1 END) as video_count,
                COUNT(CASE WHEN type = 'screenshot' THEN 1 END) as screenshot_count,
                COUNT(CASE WHEN type = 'trace' THEN 1 END) as trace_count,
                COUNT(CASE WHEN type = 'log' THEN 1 END) as log_count,
                SUM(file_size) as total_size_bytes,
                AVG(file_size) as avg_size_bytes
            FROM attachments
        `)

          // Convert bytes to human readable format
          const formatBytes = (bytes: number) => {
               if (bytes === 0) return '0 B'
               const k = 1024
               const sizes = ['B', 'KB', 'MB', 'GB']
               const i = Math.floor(Math.log(bytes) / Math.log(k))
               return (
                    parseFloat((bytes / Math.pow(k, i)).toFixed(2)) +
                    ' ' +
                    sizes[i]
               )
          }

          res.json({
               success: true,
               data: {
                    ...stats,
                    total_size_formatted: formatBytes(
                         stats.total_size_bytes || 0,
                    ),
                    avg_size_formatted: formatBytes(stats.avg_size_bytes || 0),
               },
               timestamp: new Date().toISOString(),
          })
     } catch (error) {
          console.error('Error fetching attachment stats:', error)
          res.status(500).json({
               success: false,
               error: 'Failed to fetch attachment stats',
               message:
                    error instanceof Error ? error.message : 'Unknown error',
               timestamp: new Date().toISOString(),
          })
     }
})

export default router

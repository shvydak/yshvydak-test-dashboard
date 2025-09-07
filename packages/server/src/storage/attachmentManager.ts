import fs from 'fs'
import path from 'path'
import {v4 as uuidv4} from 'uuid'

export type AttachmentType = 'video' | 'screenshot' | 'trace' | 'log'

export interface AttachmentMetadata {
     id: string
     testResultId: string
     type: AttachmentType
     fileName: string
     filePath: string
     fileSize: number
     mimeType?: string
     url: string
}

export class AttachmentManager {
     private attachmentsDir: string

     constructor(baseDir: string) {
          this.attachmentsDir = path.join(baseDir, 'attachments')
          this.ensureDirectoryExists()
     }

     private ensureDirectoryExists(): void {
          if (!fs.existsSync(this.attachmentsDir)) {
               fs.mkdirSync(this.attachmentsDir, {recursive: true})
               console.log(
                    `Created attachments directory: ${this.attachmentsDir}`,
               )
          }
     }

     private ensureTestDirectory(testResultId: string): string {
          const testDir = path.join(this.attachmentsDir, testResultId)
          if (!fs.existsSync(testDir)) {
               fs.mkdirSync(testDir, {recursive: true})
          }
          return testDir
     }

     private getMimeType(filePath: string): string {
          const ext = path.extname(filePath).toLowerCase()

          const mimeTypes: {[key: string]: string} = {
               '.mp4': 'video/mp4',
               '.webm': 'video/webm',
               '.avi': 'video/x-msvideo',
               '.png': 'image/png',
               '.jpg': 'image/jpeg',
               '.jpeg': 'image/jpeg',
               '.gif': 'image/gif',
               '.webp': 'image/webp',
               '.zip': 'application/zip',
               '.json': 'application/json',
               '.log': 'text/plain',
               '.txt': 'text/plain',
               '.html': 'text/html',
          }

          return mimeTypes[ext] || 'application/octet-stream'
     }

     private generateFileName(
          type: AttachmentType,
          originalFileName?: string,
     ): string {
          const timestamp = Date.now()
          const random = Math.random().toString(36).substring(2, 8)

          if (originalFileName) {
               const ext = path.extname(originalFileName)
               const name = path.basename(originalFileName, ext)
               return `${name}-${timestamp}-${random}${ext}`
          }

          // Default file names by type
          const extensions: {[key: string]: string} = {
               video: '.webm',
               screenshot: '.png',
               trace: '.zip',
               log: '.log',
          }

          return `${type}-${timestamp}-${random}${extensions[type] || '.txt'}`
     }

     // Copy file from Playwright's temporary location to permanent storage
     async copyPlaywrightAttachment(
          sourceFilePath: string,
          testResultId: string,
          type: AttachmentType,
          originalFileName?: string,
     ): Promise<AttachmentMetadata> {
          if (!fs.existsSync(sourceFilePath)) {
               throw new Error(`Source file not found: ${sourceFilePath}`)
          }

          const testDir = this.ensureTestDirectory(testResultId)
          const fileName =
               originalFileName ||
               this.generateFileName(type, path.basename(sourceFilePath))
          const targetFilePath = path.join(testDir, fileName)

          // Copy file to permanent location
          await fs.promises.copyFile(sourceFilePath, targetFilePath)

          // Get file stats
          const stats = await fs.promises.stat(targetFilePath)
          const mimeType = this.getMimeType(targetFilePath)

          const metadata: AttachmentMetadata = {
               id: uuidv4(),
               testResultId,
               type,
               fileName,
               filePath: targetFilePath,
               fileSize: stats.size,
               mimeType,
               url: this.generateUrl(testResultId, fileName),
          }

          console.log(
               `Copied attachment: ${sourceFilePath} -> ${targetFilePath}`,
          )
          return metadata
     }

     // Save attachment from buffer/stream
     async saveAttachment(
          buffer: Buffer,
          testResultId: string,
          type: AttachmentType,
          fileName?: string,
     ): Promise<AttachmentMetadata> {
          const testDir = this.ensureTestDirectory(testResultId)
          const finalFileName = fileName || this.generateFileName(type)
          const filePath = path.join(testDir, finalFileName)

          // Write buffer to file
          await fs.promises.writeFile(filePath, buffer)

          const mimeType = this.getMimeType(filePath)

          const metadata: AttachmentMetadata = {
               id: uuidv4(),
               testResultId,
               type,
               fileName: finalFileName,
               filePath,
               fileSize: buffer.length,
               mimeType,
               url: this.generateUrl(testResultId, finalFileName),
          }

          console.log(`Saved attachment: ${filePath}`)
          return metadata
     }

     // Generate URL for accessing attachment
     generateUrl(testResultId: string, fileName: string): string {
          // This will be served by Express static middleware
          return `/attachments/${testResultId}/${fileName}`
     }

     // Get attachment file path
     getAttachmentPath(testResultId: string, fileName: string): string {
          return path.join(this.attachmentsDir, testResultId, fileName)
     }

     // Check if attachment file exists
     attachmentExists(testResultId: string, fileName: string): boolean {
          const filePath = this.getAttachmentPath(testResultId, fileName)
          return fs.existsSync(filePath)
     }

     // Delete attachment file
     async deleteAttachment(
          testResultId: string,
          fileName: string,
     ): Promise<boolean> {
          const filePath = this.getAttachmentPath(testResultId, fileName)

          if (fs.existsSync(filePath)) {
               await fs.promises.unlink(filePath)
               console.log(`Deleted attachment: ${filePath}`)

               // Check if test directory is empty and remove it
               const testDir = path.join(this.attachmentsDir, testResultId)
               try {
                    const files = await fs.promises.readdir(testDir)
                    if (files.length === 0) {
                         await fs.promises.rmdir(testDir)
                         console.log(`Removed empty test directory: ${testDir}`)
                    }
               } catch (error) {
                    // Directory might not be empty or might not exist, ignore
               }

               return true
          }

          return false
     }

     // Delete all attachments for a test result
     async deleteTestAttachments(testResultId: string): Promise<number> {
          const testDir = path.join(this.attachmentsDir, testResultId)

          if (!fs.existsSync(testDir)) {
               return 0
          }

          const files = await fs.promises.readdir(testDir)
          let deletedCount = 0

          for (const file of files) {
               const filePath = path.join(testDir, file)
               await fs.promises.unlink(filePath)
               deletedCount++
          }

          // Remove the directory
          await fs.promises.rmdir(testDir)
          console.log(
               `Deleted ${deletedCount} attachments for test ${testResultId}`,
          )

          return deletedCount
     }

     // Get storage statistics
     async getStorageStats(): Promise<{
          totalFiles: number
          totalSize: number
          testDirectories: number
          typeBreakdown: {[key: string]: {count: number; size: number}}
     }> {
          const stats = {
               totalFiles: 0,
               totalSize: 0,
               testDirectories: 0,
               typeBreakdown: {} as {
                    [key: string]: {count: number; size: number}
               },
          }

          if (!fs.existsSync(this.attachmentsDir)) {
               return stats
          }

          const testDirs = await fs.promises.readdir(this.attachmentsDir)
          stats.testDirectories = testDirs.length

          for (const testDir of testDirs) {
               const testDirPath = path.join(this.attachmentsDir, testDir)
               const dirStats = await fs.promises.stat(testDirPath)

               if (dirStats.isDirectory()) {
                    const files = await fs.promises.readdir(testDirPath)

                    for (const file of files) {
                         const filePath = path.join(testDirPath, file)
                         const fileStats = await fs.promises.stat(filePath)

                         if (fileStats.isFile()) {
                              stats.totalFiles++
                              stats.totalSize += fileStats.size

                              // Determine type from file extension
                              const ext = path.extname(file).toLowerCase()
                              let type = 'other'

                              if (['.mp4', '.webm', '.avi'].includes(ext))
                                   type = 'video'
                              else if (
                                   [
                                        '.png',
                                        '.jpg',
                                        '.jpeg',
                                        '.gif',
                                        '.webp',
                                   ].includes(ext)
                              )
                                   type = 'screenshot'
                              else if (ext === '.zip') type = 'trace'
                              else if (['.log', '.txt'].includes(ext))
                                   type = 'log'

                              if (!stats.typeBreakdown[type]) {
                                   stats.typeBreakdown[type] = {
                                        count: 0,
                                        size: 0,
                                   }
                              }

                              stats.typeBreakdown[type].count++
                              stats.typeBreakdown[type].size += fileStats.size
                         }
                    }
               }
          }

          return stats
     }

     // Cleanup old attachments (older than specified days)
     async cleanup(
          daysToKeep: number = 30,
     ): Promise<{deletedFiles: number; freedSpace: number}> {
          const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000
          let deletedFiles = 0
          let freedSpace = 0

          if (!fs.existsSync(this.attachmentsDir)) {
               return {deletedFiles, freedSpace}
          }

          const testDirs = await fs.promises.readdir(this.attachmentsDir)

          for (const testDir of testDirs) {
               const testDirPath = path.join(this.attachmentsDir, testDir)
               const dirStats = await fs.promises.stat(testDirPath)

               if (
                    dirStats.isDirectory() &&
                    dirStats.mtime.getTime() < cutoffTime
               ) {
                    const files = await fs.promises.readdir(testDirPath)

                    for (const file of files) {
                         const filePath = path.join(testDirPath, file)
                         const fileStats = await fs.promises.stat(filePath)

                         freedSpace += fileStats.size
                         await fs.promises.unlink(filePath)
                         deletedFiles++
                    }

                    await fs.promises.rmdir(testDirPath)
               }
          }

          console.log(
               `Cleanup complete: deleted ${deletedFiles} files, freed ${freedSpace} bytes`,
          )
          return {deletedFiles, freedSpace}
     }
}

// Factory function
export function createAttachmentManager(baseDir: string): AttachmentManager {
     return new AttachmentManager(baseDir)
}

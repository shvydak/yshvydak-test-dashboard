#!/usr/bin/env node

/**
 * CLI script to clear all test data from YShvydak Test Dashboard
 *
 * Usage:
 *   node scripts/clear-data.js
 *   npm run clear-data
 */

const fs = require('fs')
const path = require('path')
const readline = require('readline')

const DB_PATH = path.join(
     __dirname,
     '../packages/server/test-results/test-results.db',
)

async function confirmClear() {
     const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
     })

     return new Promise((resolve) => {
          rl.question(
               '⚠️  Are you sure you want to clear ALL test data? This action cannot be undone. (y/N): ',
               (answer) => {
                    rl.close()
                    resolve(
                         answer.toLowerCase() === 'y' ||
                              answer.toLowerCase() === 'yes',
                    )
               },
          )
     })
}

async function clearData() {
     console.log('🗑️  YShvydak Test Dashboard - Clear All Data\n')

     // Check if database exists
     if (!fs.existsSync(DB_PATH)) {
          console.log('ℹ️  No database found. Nothing to clear.')
          return
     }

     // Get file size before deletion
     const stats = fs.statSync(DB_PATH)
     const fileSizeInBytes = stats.size
     const fileSizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2)

     console.log(`📊 Current database: ${fileSizeInMB} MB`)
     console.log(`📁 Database path: ${DB_PATH}\n`)

     // Confirm deletion
     const confirmed = await confirmClear()

     if (!confirmed) {
          console.log('❌ Operation cancelled.')
          return
     }

     try {
          // Delete the database file
          fs.unlinkSync(DB_PATH)
          console.log('✅ Database deleted successfully!')
          console.log(
               '📝 Next time you run tests, a fresh database will be created.',
          )

          // Also clear the entire test-results directory
          const testResultsDir = path.dirname(DB_PATH)
          if (fs.existsSync(testResultsDir)) {
               const files = fs.readdirSync(testResultsDir)
               let deletedFiles = 0

               for (const file of files) {
                    const filePath = path.join(testResultsDir, file)
                    if (fs.statSync(filePath).isFile()) {
                         fs.unlinkSync(filePath)
                         deletedFiles++
                    }
               }

               if (deletedFiles > 0) {
                    console.log(
                         `🧹 Cleared ${deletedFiles} additional files from test-results directory.`,
                    )
               }
          }
     } catch (error) {
          console.error('❌ Error clearing data:', error.message)
          process.exit(1)
     }
}

// Run the script
clearData().catch(console.error)

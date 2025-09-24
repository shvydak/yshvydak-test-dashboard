#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose()
const path = require('path')

// Connect to the database
const dbPath = path.join(
     __dirname,
     'packages/server/test-results/test-results.db',
)
console.log(`📁 Connecting to database: ${dbPath}`)

const db = new sqlite3.Database(dbPath, (err) => {
     if (err) {
          console.error('❌ Error connecting to database:', err.message)
          process.exit(1)
     }
     console.log('✅ Connected to the database')
})

// First, let's check what the subquery returns for test-66jqtq
console.log('\n🔍 Step 1: Check subquery for test-66jqtq')
console.log('='.repeat(80))

const subquery = `
    SELECT id, test_id, created_at, updated_at
    FROM test_results 
    WHERE test_id = 'test-66jqtq' 
    ORDER BY updated_at DESC
`

db.all(subquery, [], (err, rows) => {
     if (err) {
          console.error('❌ Query error:', err.message)
          return
     }

     console.log(`✅ Found ${rows.length} records for test-66jqtq:`)
     rows.forEach((row, index) => {
          console.log(
               `${index + 1}. ID: ${row.id}, created: ${
                    row.created_at
               }, updated: ${row.updated_at}`,
          )
     })

     if (rows.length > 0) {
          const latestId = rows[0].id
          console.log(`\n🎯 Latest record ID: ${latestId}`)

          // Now check if this ID is in the main query results
          console.log('\n🔍 Step 2: Check if this ID appears in main query')
          console.log('='.repeat(80))

          const mainQuery = `
            SELECT tr.id, tr.test_id, tr.name, tr.status, tr.created_at, tr.updated_at
            FROM test_results tr
            WHERE tr.id IN (
                SELECT id FROM test_results tr2 
                WHERE tr2.test_id = tr.test_id 
                ORDER BY tr2.updated_at DESC 
                LIMIT 1
            )
            AND tr.test_id = 'test-66jqtq'
        `

          db.all(mainQuery, [], (err, mainRows) => {
               if (err) {
                    console.error('❌ Main query error:', err.message)
                    return
               }

               console.log(`✅ Main query found ${mainRows.length} records:`)
               mainRows.forEach((row, index) => {
                    console.log(
                         `${index + 1}. ID: ${row.id}, created: ${
                              row.created_at
                         }, updated: ${row.updated_at}`,
                    )
               })

               // Now check the actual API query without the test_id filter
               console.log('\n🔍 Step 3: Check full API query results')
               console.log('='.repeat(80))

               const apiQuery = `
                SELECT tr.id, tr.test_id, tr.name, tr.status, tr.created_at, tr.updated_at
                FROM test_results tr
                WHERE tr.id IN (
                    SELECT id FROM test_results tr2 
                    WHERE tr2.test_id = tr.test_id 
                    ORDER BY tr2.updated_at DESC 
                    LIMIT 1
                )
                ORDER BY tr.updated_at DESC
                LIMIT 10
            `

               db.all(apiQuery, [], (err, apiRows) => {
                    if (err) {
                         console.error('❌ API query error:', err.message)
                         return
                    }

                    console.log(`✅ API query found ${apiRows.length} records:`)
                    apiRows.forEach((row, index) => {
                         console.log(
                              `${index + 1}. ${row.test_id} - ${
                                   row.name
                              } (updated: ${row.updated_at})`,
                         )
                    })

                    const targetInApi = apiRows.find(
                         (row) => row.test_id === 'test-66jqtq',
                    )
                    if (targetInApi) {
                         console.log(`\n✅ test-66jqtq found in API results!`)
                         console.log(`   Updated: ${targetInApi.updated_at}`)
                    } else {
                         console.log(
                              `\n❌ test-66jqtq NOT found in API results`,
                         )
                    }

                    // Close the database connection
                    db.close((err) => {
                         if (err) {
                              console.error(
                                   '❌ Error closing database:',
                                   err.message,
                              )
                         } else {
                              console.log('\n✅ Database connection closed')
                         }
                    })
               })
          })
     } else {
          console.log('❌ No records found for test-66jqtq')
          db.close()
     }
})

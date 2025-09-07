import {TestResult} from '@yshvydak/core'
import {
     formatErrorLines,
     extractLineNumber,
     formatShortError,
} from '../utils/errorFormatter'

interface ErrorsOverviewProps {
     tests: TestResult[]
}

interface ErrorDetails {
     test: TestResult
     errorMessage: string
     stackTrace?: string
     filePath: string
     lineNumber?: string
}

export default function ErrorsOverview({tests}: ErrorsOverviewProps) {
     // Фильтруем только failed тесты с errorMessage
     const failedTests = tests.filter(
          (test) => test.status === 'failed' && test.errorMessage,
     )

     if (failedTests.length === 0) {
          return (
               <div className="card">
                    <div className="card-header">
                         <h3 className="card-title">Errors</h3>
                         <p className="card-description">
                              Test failures and error details
                         </p>
                    </div>
                    <div className="card-content">
                         <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                              <div className="text-4xl mb-4">🎉</div>
                              <p>No failed tests found!</p>
                              <p className="text-sm mt-2">
                                   All tests are passing successfully.
                              </p>
                         </div>
                    </div>
               </div>
          )
     }

     // Парсим детали ошибок
     const parseErrorDetails = (test: TestResult): ErrorDetails => {
          const errorMessage = test.errorMessage || ''
          const lineNumber = extractLineNumber(errorMessage)
          const mainError = formatShortError(errorMessage, 3)

          return {
               test,
               errorMessage: mainError,
               stackTrace: errorMessage,
               filePath: test.filePath,
               lineNumber,
          }
     }

     const errorDetails = failedTests.map(parseErrorDetails)

     return (
          <div className="card">
               <div className="card-header">
                    <h3 className="card-title">Errors</h3>
                    <p className="card-description">
                         {failedTests.length} test
                         {failedTests.length !== 1 ? 's' : ''} failed with
                         errors
                    </p>
               </div>
               <div className="card-content">
                    <div className="space-y-6">
                         {errorDetails.map((error, index) => (
                              <div
                                   key={error.test.id}
                                   className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50">
                                   {/* Test Header */}
                                   <div className="flex items-start justify-between mb-3">
                                        <div className="flex-1">
                                             <h4 className="font-semibold text-gray-900 dark:text-white">
                                                  {error.test.name}
                                             </h4>
                                             <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                                  {error.filePath}
                                                  {error.lineNumber &&
                                                       `:${error.lineNumber}`}
                                             </p>
                                        </div>
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                                             Failed
                                        </span>
                                   </div>

                                   {/* Error Details */}
                                   <div className="bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-600 overflow-hidden">
                                        <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 border-b border-gray-200 dark:border-gray-600">
                                             <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                                  Error Details
                                             </span>
                                        </div>
                                        <div className="p-3 max-h-64 overflow-y-auto">
                                             <div className="space-y-1">
                                                  {formatErrorLines(
                                                       error.stackTrace ||
                                                            error.errorMessage,
                                                  )}
                                             </div>
                                        </div>
                                   </div>

                                   {/* Actions */}
                                   <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                                        <button
                                             onClick={() => {
                                                  // Копировать полную ошибку в буфер обмена
                                                  navigator.clipboard.writeText(
                                                       error.stackTrace ||
                                                            error.errorMessage,
                                                  )
                                             }}
                                             className="text-xs px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors">
                                             📋 Copy Error
                                        </button>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                             Duration: {error.test.duration}ms
                                        </span>
                                   </div>
                              </div>
                         ))}
                    </div>
               </div>
          </div>
     )
}

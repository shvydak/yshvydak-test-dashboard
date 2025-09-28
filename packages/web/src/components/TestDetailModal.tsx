import {useState, useEffect} from 'react'
import {TestResult} from '@yshvydak/core'
import {formatErrorLines} from '../utils/errorFormatter'
import {config} from '../config/environment.config'
import {authFetch, createProtectedFileURL, getAuthToken} from '../utils/authFetch'

interface Attachment {
     id: string
     testResultId: string
     type: 'video' | 'screenshot' | 'trace' | 'log'
     filePath: string
     fileSize: number
     url: string
}

interface AttachmentWithBlobURL extends Attachment {
     blobURL?: string
}

interface TestDetailModalProps {
     test: TestResult | null
     isOpen: boolean
     onClose: () => void
}

export default function TestDetailModal({
     test,
     isOpen,
     onClose,
}: TestDetailModalProps) {
     const [attachments, setAttachments] = useState<AttachmentWithBlobURL[]>([])
     const [loading, setLoading] = useState(false)
     const [error, setError] = useState<string | null>(null)
     const [activeTab, setActiveTab] = useState<
          'overview' | 'attachments' | 'steps'
     >('overview')

     useEffect(() => {
          if (isOpen && test) {
               fetchAttachments(test.id)
          }

          // Cleanup blob URLs when modal closes
          return () => {
               attachments.forEach(attachment => {
                    if (attachment.blobURL) {
                         URL.revokeObjectURL(attachment.blobURL)
                    }
               })
          }
     }, [isOpen, test])

     // Cleanup blob URLs when component unmounts
     useEffect(() => {
          return () => {
               attachments.forEach(attachment => {
                    if (attachment.blobURL) {
                         URL.revokeObjectURL(attachment.blobURL)
                    }
               })
          }
     }, [attachments])

     const fetchAttachments = async (testId: string) => {
          setLoading(true)
          setError(null)
          try {
               const response = await authFetch(
                    `${config.api.serverUrl}/api/tests/${testId}/attachments`,
               )
               if (response.ok) {
                    const data = await response.json()
                    const attachmentsData: Attachment[] = data.data || []

                    // Create blob URLs for preview attachments (screenshots, videos)
                    const attachmentsWithBlobs = await Promise.all(
                         attachmentsData.map(async (attachment) => {
                              let blobURL: string | undefined

                              // Create blob URLs for files that need preview
                              if (attachment.type === 'screenshot' || attachment.type === 'video') {
                                   try {
                                        blobURL = await createProtectedFileURL(attachment.url, config.api.serverUrl)
                                   } catch (error) {
                                        console.error(`Failed to create blob URL for ${attachment.type}:`, error)
                                   }
                              }

                              return { ...attachment, blobURL }
                         })
                    )

                    setAttachments(attachmentsWithBlobs)
               } else {
                    setError('Failed to fetch attachments')
               }
          } catch (err) {
               setError('Error fetching attachments')
          } finally {
               setLoading(false)
          }
     }

     const getAttachmentIcon = (type: string) => {
          switch (type) {
               case 'video':
                    return '🎬'
               case 'screenshot':
                    return '📸'
               case 'trace':
                    return '🔍'
               case 'log':
                    return '📄'
               default:
                    return '📎'
          }
     }

     const formatFileSize = (bytes: number) => {
          if (bytes === 0) return 'N/A'
          const k = 1024
          const sizes = ['Bytes', 'KB', 'MB', 'GB']
          const i = Math.floor(Math.log(bytes) / Math.log(k))
          return (
               parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
          )
     }

     const downloadAttachment = async (attachment: AttachmentWithBlobURL) => {
          try {
               const blobURL = await createProtectedFileURL(attachment.url, config.api.serverUrl)
               const link = document.createElement('a')
               link.href = blobURL
               link.download = attachment.url.split('/').pop() || 'attachment'
               document.body.appendChild(link)
               link.click()
               document.body.removeChild(link)
               // Clean up the blob URL after download
               URL.revokeObjectURL(blobURL)
          } catch (error) {
               console.error('Failed to download attachment:', error)
               setError('Failed to download attachment')
          }
     }

     const openTraceViewer = async (attachment: AttachmentWithBlobURL) => {
          try {
               // Get JWT token for authentication
               const token = getAuthToken()
               if (!token) {
                    setError('Authentication required to view trace')
                    return
               }

               // Create direct URL to our trace endpoint with JWT token
               const traceURL = `${config.api.serverUrl}/api/tests/traces/${attachment.id}?token=${encodeURIComponent(token)}`

               // For trace files, open in Playwright Trace Viewer with direct URL
               window.open(
                    `https://trace.playwright.dev/?trace=${encodeURIComponent(traceURL)}`,
                    '_blank',
               )
          } catch (error) {
               console.error('Failed to open trace viewer:', error)
               setError('Failed to open trace viewer')
          }
     }

     const getStatusColor = (status: string) => {
          switch (status) {
               case 'passed':
                    return 'text-success-600 dark:text-success-400 bg-success-50 dark:bg-success-900/20'
               case 'failed':
                    return 'text-danger-600 dark:text-danger-400 bg-danger-50 dark:bg-danger-900/20'
               case 'skipped':
                    return 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800'
               default:
                    return 'text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800'
          }
     }

     const getStatusIcon = (status: string) => {
          switch (status) {
               case 'passed':
                    return '✅'
               case 'failed':
                    return '❌'
               case 'skipped':
                    return '⏭️'
               default:
                    return '❓'
          }
     }

     const formatDuration = (duration: number) => {
          if (duration < 1000) {
               return `${duration}ms`
          }
          return `${(duration / 1000).toFixed(1)}s`
     }

     if (!isOpen || !test) return null

     return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
               <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                         <div className="flex items-center space-x-3">
                              <span
                                   className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                                        test.status,
                                   )}`}>
                                   <span className="mr-1">
                                        {getStatusIcon(test.status)}
                                   </span>
                                   {test.status}
                              </span>
                              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                   {test.name}
                              </h2>
                         </div>
                         <button
                              onClick={onClose}
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                              <svg
                                   className="w-6 h-6"
                                   fill="none"
                                   stroke="currentColor"
                                   viewBox="0 0 24 24">
                                   <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M6 18L18 6M6 6l12 12"
                                   />
                              </svg>
                         </button>
                    </div>

                    {/* Tabs */}
                    <div className="border-b border-gray-200 dark:border-gray-700">
                         <nav className="flex space-x-8 px-6">
                              {[
                                   {
                                        key: 'overview',
                                        label: 'Overview',
                                        icon: '📋',
                                   },
                                   {
                                        key: 'attachments',
                                        label: `Attachments (${attachments.length})`,
                                        icon: '📎',
                                   },
                                   {
                                        key: 'steps',
                                        label: 'Test Steps',
                                        icon: '🔄',
                                   },
                              ].map((tab) => (
                                   <button
                                        key={tab.key}
                                        onClick={() =>
                                             setActiveTab(tab.key as any)
                                        }
                                        className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                                             activeTab === tab.key
                                                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                        }`}>
                                        <span className="mr-2">{tab.icon}</span>
                                        {tab.label}
                                   </button>
                              ))}
                         </nav>
                    </div>

                    {/* Content */}
                    <div className="p-6 overflow-y-auto max-h-[60vh]">
                         {activeTab === 'overview' && (
                              <div className="space-y-6">
                                   <div className="grid grid-cols-2 gap-6">
                                        <div>
                                             <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                                                  Test Details
                                             </h3>
                                             <div className="space-y-3">
                                                  <div>
                                                       <span className="text-xs text-gray-400">
                                                            File Path:
                                                       </span>
                                                       <p className="font-mono text-sm text-gray-900 dark:text-white">
                                                            {test.filePath}
                                                       </p>
                                                  </div>
                                                  <div>
                                                       <span className="text-xs text-gray-400">
                                                            Duration:
                                                       </span>
                                                       <p className="text-sm text-gray-900 dark:text-white">
                                                            {formatDuration(
                                                                 test.duration,
                                                            )}
                                                       </p>
                                                  </div>
                                                  <div>
                                                       <span className="text-xs text-gray-400">
                                                            Run ID:
                                                       </span>
                                                       <p className="font-mono text-xs text-gray-900 dark:text-white">
                                                            {test.runId}
                                                       </p>
                                                  </div>
                                                  {test.rerunCount &&
                                                       test.rerunCount > 0 && (
                                                            <div>
                                                                 <span className="text-xs text-gray-400">
                                                                      Rerun
                                                                      Count:
                                                                 </span>
                                                                 <p className="text-sm text-gray-900 dark:text-white">
                                                                      {
                                                                           test.rerunCount
                                                                      }
                                                                 </p>
                                                            </div>
                                                       )}
                                             </div>
                                        </div>
                                        <div>
                                             <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                                                  Execution Summary
                                             </h3>
                                             <div className="space-y-3">
                                                  <div>
                                                       <span className="text-xs text-gray-400">
                                                            Status:
                                                       </span>
                                                       <p className="text-sm text-gray-900 dark:text-white">
                                                            {test.status}
                                                       </p>
                                                  </div>
                                                  <div>
                                                       <span className="text-xs text-gray-400">
                                                            Attachments:
                                                       </span>
                                                       <p className="text-sm text-gray-900 dark:text-white">
                                                            {loading
                                                                 ? 'Loading...'
                                                                 : `${attachments.length} file(s)`}
                                                       </p>
                                                  </div>
                                             </div>
                                        </div>
                                   </div>

                                   {test.errorMessage && (
                                        <div>
                                             <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                                                  Errors
                                             </h3>
                                             <div className="bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-600 overflow-hidden">
                                                  <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 border-b border-gray-200 dark:border-gray-600">
                                                       <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                                            Error Details
                                                       </span>
                                                  </div>
                                                  <div className="p-3 max-h-64 overflow-y-auto">
                                                       <div className="space-y-1">
                                                            {formatErrorLines(
                                                                 test.errorMessage,
                                                            )}
                                                       </div>
                                                  </div>
                                             </div>
                                             <div className="flex items-center gap-3 mt-3">
                                                  <button
                                                       onClick={() => {
                                                            // Copy full error to clipboard
                                                            navigator.clipboard.writeText(
                                                                 test.errorMessage as any,
                                                            )
                                                       }}
                                                       className="text-xs px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors">
                                                       📋 Copy Error
                                                  </button>
                                             </div>
                                        </div>
                                   )}
                              </div>
                         )}

                         {activeTab === 'attachments' && (
                              <div className="space-y-4">
                                   {loading ? (
                                        <div className="text-center py-8">
                                             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto"></div>
                                             <p className="mt-2 text-sm text-gray-500">
                                                  Loading attachments...
                                             </p>
                                        </div>
                                   ) : error ? (
                                        <div className="text-center py-8">
                                             <p className="text-red-600 dark:text-red-400">
                                                  {error}
                                             </p>
                                        </div>
                                   ) : attachments.length === 0 ? (
                                        <div className="text-center py-8">
                                             <p className="text-gray-500 dark:text-gray-400">
                                                  No attachments found for this
                                                  test
                                             </p>
                                        </div>
                                   ) : (
                                        <div className="grid grid-cols-1 gap-4">
                                             {attachments.map((attachment) => (
                                                  <div
                                                       key={attachment.id}
                                                       className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                                       <div className="flex items-center justify-between">
                                                            <div className="flex items-center space-x-3">
                                                                 <span className="text-2xl">
                                                                      {getAttachmentIcon(
                                                                           attachment.type,
                                                                      )}
                                                                 </span>
                                                                 <div>
                                                                      <h4 className="font-medium text-gray-900 dark:text-white">
                                                                           {attachment.type
                                                                                .charAt(
                                                                                     0,
                                                                                )
                                                                                .toUpperCase() +
                                                                                attachment.type.slice(
                                                                                     1,
                                                                                )}
                                                                      </h4>
                                                                      <p className="text-sm text-gray-500 dark:text-gray-400">
                                                                           {formatFileSize(
                                                                                attachment.fileSize,
                                                                           )}
                                                                      </p>
                                                                 </div>
                                                            </div>
                                                            <div className="flex space-x-2">
                                                                 {attachment.type ===
                                                                      'trace' && (
                                                                      <button
                                                                           onClick={() =>
                                                                                openTraceViewer(
                                                                                     attachment,
                                                                                )
                                                                           }
                                                                           className="px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-md text-sm hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors">
                                                                           🔍
                                                                           View
                                                                           Trace
                                                                      </button>
                                                                 )}
                                                                 {attachment.type ===
                                                                      'log' && (
                                                                      <button
                                                                           onClick={() =>
                                                                                window.open(
                                                                                     `${config.api.serverUrl}/${attachment.url}`,
                                                                                     '_blank',
                                                                                )
                                                                           }
                                                                           className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-md text-sm hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors">
                                                                           👁️
                                                                           View
                                                                      </button>
                                                                 )}
                                                                 <button
                                                                      onClick={() =>
                                                                           downloadAttachment(
                                                                                attachment,
                                                                           )
                                                                      }
                                                                      className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                                                                      📥
                                                                      Download
                                                                 </button>
                                                            </div>
                                                       </div>
                                                       {attachment.type ===
                                                            'screenshot' && (
                                                            <div className="mt-4">
                                                                 <img
                                                                      src={attachment.blobURL || `${config.api.serverUrl}/${attachment.url}`}
                                                                      alt="Test Screenshot"
                                                                      className="max-w-full h-auto rounded border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-90 transition-opacity"
                                                                      onClick={async () => {
                                                                           try {
                                                                                const blobURL = attachment.blobURL || await createProtectedFileURL(attachment.url, config.api.serverUrl)
                                                                                window.open(blobURL, '_blank')
                                                                           } catch (error) {
                                                                                console.error('Failed to open screenshot:', error)
                                                                           }
                                                                      }}
                                                                 />
                                                            </div>
                                                       )}
                                                       {attachment.type ===
                                                            'video' && (
                                                            <div className="mt-4">
                                                                 <video
                                                                      controls
                                                                      className="max-w-full h-auto rounded border border-gray-200 dark:border-gray-700"
                                                                      src={attachment.blobURL || `${config.api.serverUrl}/${attachment.url}`}>
                                                                      Your
                                                                      browser
                                                                      does not
                                                                      support
                                                                      video
                                                                      playback.
                                                                 </video>
                                                            </div>
                                                       )}
                                                  </div>
                                             ))}
                                        </div>
                                   )}
                              </div>
                         )}

                         {activeTab === 'steps' && (
                              <div className="space-y-4">
                                   {test.steps && test.steps.length > 0 ? (
                                        <div className="space-y-3">
                                             {test.steps.map((step, index) => (
                                                  <div
                                                       key={index}
                                                       className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                                       <div className="flex items-center justify-between">
                                                            <h4 className="font-medium text-gray-900 dark:text-white">
                                                                 Step{' '}
                                                                 {index + 1}:{' '}
                                                                 {step.title}
                                                            </h4>
                                                            <span className="text-sm text-gray-500 dark:text-gray-400">
                                                                 {formatDuration(
                                                                      step.duration,
                                                                 )}
                                                            </span>
                                                       </div>
                                                       <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                                            Category:{' '}
                                                            {step.category}
                                                       </p>
                                                       {step.error && (
                                                            <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                                                                 <pre className="text-xs text-red-800 dark:text-red-200 whitespace-pre-wrap">
                                                                      {
                                                                           step.error
                                                                      }
                                                                 </pre>
                                                            </div>
                                                       )}
                                                  </div>
                                             ))}
                                        </div>
                                   ) : (
                                        <div className="text-center py-8">
                                             <p className="text-gray-500 dark:text-gray-400">
                                                  No test steps recorded
                                             </p>
                                        </div>
                                   )}
                              </div>
                         )}
                    </div>
               </div>
          </div>
     )
}

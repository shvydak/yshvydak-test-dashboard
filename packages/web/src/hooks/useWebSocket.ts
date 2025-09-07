import {useEffect, useRef, useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {useTestsStore} from '../store/testsStore'

interface WebSocketMessage {
     type: string
     data?: any
     timestamp?: string
     clientId?: string
}

interface WebSocketOptions {
     onTestCompleted?: (data: any) => void
     onRunCompleted?: (data: any) => void
}

export function useWebSocket(url: string, options?: WebSocketOptions) {
     const [isConnected, setIsConnected] = useState(false)
     const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(
          null,
     )
     const wsRef = useRef<WebSocket | null>(null)
     const queryClient = useQueryClient()
     const {fetchTests, fetchRuns, setGroupRunning, setTestRunning, setRunningAllTests} = useTestsStore()
     const reconnectTimeoutRef = useRef<NodeJS.Timeout>()
     const reconnectAttempts = useRef(0)
     const maxReconnectAttempts = 5

     const handleConnectionStatus = (statusData: any) => {
          const { activeRuns, activeGroups, isAnyProcessRunning } = statusData
          
          console.log(`🔄 Restoring state from WebSocket:`, {
               activeRuns: activeRuns.length,
               activeGroups: activeGroups.length,
               isAnyProcessRunning
          })

          // Clear all current running states
          setRunningAllTests(false)
          
          // Restore states based on active processes
          if (isAnyProcessRunning && activeRuns.length > 0) {
               activeRuns.forEach((run: any) => {
                    switch (run.type) {
                         case 'run-all':
                              console.log(`🔄 Restoring run-all state (Run ID: ${run.id})`)
                              setRunningAllTests(true)
                              break
                         case 'run-group':
                              if (run.details.filePath) {
                                   console.log(`🔄 Restoring group running state: ${run.details.filePath}`)
                                   setGroupRunning(run.details.filePath, true)
                              }
                              break
                         case 'rerun':
                              if (run.details.originalTestId) {
                                   console.log(`🔄 Restoring test running state: ${run.details.originalTestId}`)
                                   setTestRunning(run.details.originalTestId, true)
                              }
                              break
                    }
               })
               
               console.log(`✅ State restored: ${activeRuns.length} active processes`)
          } else {
               console.log('✅ No active processes found - all buttons will be enabled')
               
               // Ensure all states are cleared
               // Note: We don't need to clear individual running states here as the store
               // should handle this, but we can add it if needed
          }

          // Refresh data to get latest state
          fetchTests()
          fetchRuns()
     }

     const connect = () => {
          try {
               console.log('🔌 Connecting to WebSocket:', url)
               wsRef.current = new WebSocket(url)

               wsRef.current.onopen = () => {
                    console.log('✅ WebSocket connected')
                    setIsConnected(true)
                    reconnectAttempts.current = 0
               }

               wsRef.current.onmessage = (event) => {
                    try {
                         const message: WebSocketMessage = JSON.parse(
                              event.data,
                         )
                         console.log('📨 WebSocket message received:', message)
                         setLastMessage(message)
                         handleMessage(message)
                    } catch (error) {
                         console.error(
                              'Error parsing WebSocket message:',
                              error,
                         )
                    }
               }

               wsRef.current.onclose = (event) => {
                    console.log(
                         '🔌 WebSocket disconnected:',
                         event.code,
                         event.reason,
                    )
                    setIsConnected(false)

                    // Attempt to reconnect
                    if (reconnectAttempts.current < maxReconnectAttempts) {
                         const delay = Math.min(
                              1000 * Math.pow(2, reconnectAttempts.current),
                              30000,
                         )
                         console.log(
                              `🔄 Reconnecting in ${delay}ms (attempt ${
                                   reconnectAttempts.current + 1
                              }/${maxReconnectAttempts})`,
                         )

                         reconnectTimeoutRef.current = setTimeout(() => {
                              reconnectAttempts.current++
                              connect()
                         }, delay)
                    } else {
                         console.error('❌ Max reconnection attempts reached')
                    }
               }

               wsRef.current.onerror = (error) => {
                    console.error('❌ WebSocket error:', error)
               }
          } catch (error) {
               console.error('Error creating WebSocket connection:', error)
          }
     }

     const handleMessage = (message: WebSocketMessage) => {
          switch (message.type) {
               case 'dashboard:refresh':
                    console.log('🔄 Dashboard refresh requested:', message.data)
                    // Refresh both React Query and Zustand store
                    queryClient.invalidateQueries()
                    fetchTests()
                    fetchRuns()
                    console.log('✅ Data refreshed via WebSocket')

                    // Notify about run completion if it's a rerun
                    if (message.data?.isRerun && options?.onRunCompleted) {
                         options.onRunCompleted(message.data)
                    }
                    break

               case 'run:status':
                    console.log('📊 Run status update:', message.data)
                    // Refresh both stores
                    queryClient.invalidateQueries({
                         queryKey: ['dashboard-stats'],
                    })
                    queryClient.invalidateQueries({queryKey: ['tests']})
                    queryClient.invalidateQueries({queryKey: ['runs']})
                    fetchTests()
                    fetchRuns()
                    console.log('✅ Run status updated via WebSocket')

                    // Notify about run completion
                    if (options?.onRunCompleted) {
                         options.onRunCompleted(message.data)
                    }
                    break

               case 'test:completed':
                    console.log('✅ Test completed:', message.data)
                    queryClient.invalidateQueries({queryKey: ['tests']})
                    queryClient.invalidateQueries({
                         queryKey: ['dashboard-stats'],
                    })
                    fetchTests()
                    console.log('✅ Test completion processed via WebSocket')
                    break

               case 'test:status':
                    console.log('🎯 Test status update:', message.data)
                    queryClient.invalidateQueries({queryKey: ['tests']})
                    fetchTests()
                    console.log('✅ Test status updated via WebSocket')
                    break

               case 'stats:update':
                    console.log('📈 Stats update:', message.data)
                    queryClient.invalidateQueries({
                         queryKey: ['dashboard-stats'],
                    })
                    fetchTests()
                    console.log('✅ Stats updated via WebSocket')
                    break

               case 'discovery:completed':
                    console.log('🔍 Test discovery completed:', message.data)
                    queryClient.invalidateQueries({queryKey: ['tests']})
                    queryClient.invalidateQueries({
                         queryKey: ['dashboard-stats'],
                    })
                    fetchTests()
                    fetchRuns()
                    console.log(
                         '✅ Discovery completion processed via WebSocket',
                    )
                    break

               case 'run:started':
                    console.log('🚀 Test run started:', message.data)
                    queryClient.invalidateQueries({queryKey: ['runs']})
                    fetchRuns()
                    console.log('✅ Run start processed via WebSocket')
                    break

               case 'run:completed':
                    console.log('🏁 Test run completed:', message.data)
                    queryClient.invalidateQueries({queryKey: ['tests']})
                    queryClient.invalidateQueries({queryKey: ['runs']})
                    queryClient.invalidateQueries({
                         queryKey: ['dashboard-stats'],
                    })
                    fetchTests()
                    fetchRuns()
                    console.log('✅ Run completion processed via WebSocket')

                    // Clear group running state if this was a group run
                    if (message.data?.type === 'run-group' && message.data?.filePath) {
                         setGroupRunning(message.data.filePath, false)
                         console.log(`✅ Group ${message.data.filePath} marked as completed`)
                    }

                    // Clear run-all state if this was a run-all
                    if (message.data?.type === 'run-all') {
                         setRunningAllTests(false)
                         console.log('✅ Run All Tests marked as completed')
                    }

                    // Clear individual test running state if this was a rerun
                    if (message.data?.isRerun && message.data?.originalTestId) {
                         setTestRunning(message.data.originalTestId, false)
                         console.log(`✅ Test ${message.data.originalTestId} marked as completed`)
                    }

                    // Notify about run completion
                    if (options?.onRunCompleted) {
                         options.onRunCompleted(message.data)
                    }
                    break

               case 'connection':
                    console.log('🔗 Connection established:', message.data)
                    break

               case 'connection:status':
                    console.log('📡 Connection status received:', message.data)
                    handleConnectionStatus(message.data)
                    break

               case 'pong':
                    // Keep-alive response
                    break

               default:
                    console.log(
                         '❓ Unknown WebSocket message type:',
                         message.type,
                    )
          }
     }

     const sendMessage = (message: WebSocketMessage) => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
               wsRef.current.send(JSON.stringify(message))
          } else {
               console.warn('⚠️ WebSocket not connected, cannot send message')
          }
     }

     const disconnect = () => {
          if (reconnectTimeoutRef.current) {
               clearTimeout(reconnectTimeoutRef.current)
          }

          if (wsRef.current) {
               wsRef.current.close(1000, 'Intentional disconnect')
          }
     }

     useEffect(() => {
          connect()

          // Send periodic ping to keep connection alive
          const pingInterval = setInterval(() => {
               if (isConnected) {
                    sendMessage({type: 'ping'})
               }
          }, 30000)

          return () => {
               clearInterval(pingInterval)
               disconnect()
          }
     }, [url])

     return {
          isConnected,
          lastMessage,
          sendMessage,
          disconnect,
     }
}

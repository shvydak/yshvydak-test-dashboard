import { Button } from '@shared/components'
import { config } from '@config/environment.config'
import { useTestsStore } from '../../../store/testsStore'
import { useDashboardActions } from '../hooks'

export function DashboardActions() {
	const {
		discoverTests,
		runAllTests,
		fetchTests,
		isDiscovering,
		isRunningAllTests,
		getIsAnyTestRunning,
		setRunningAllTests,
	} = useTestsStore()

	const { clearingData, forceResetting, clearAllData, forceResetProcesses } = useDashboardActions()
	const isAnyTestRunning = getIsAnyTestRunning()

	return (
		<div className="card">
			<div className="card-header">
				<h3 className="card-title">Debug Actions...</h3>
				<p className="card-description">Common tasks and operations</p>
			</div>
			<div className="card-content space-y-3">
				<Button
					variant="primary"
					fullWidth
					loading={isDiscovering}
					disabled={isAnyTestRunning}
					onClick={discoverTests}
				>
					{isDiscovering ? 'Discovering...' : '🔍 Discover Tests'}
				</Button>

				<Button
					variant="secondary"
					fullWidth
					loading={isRunningAllTests}
					disabled={isAnyTestRunning}
					onClick={runAllTests}
				>
					{isRunningAllTests ? 'Running...' : '▶️ Run All Tests'}
				</Button>

				<Button
					variant="secondary"
					fullWidth
					disabled={isAnyTestRunning}
					onClick={() => fetchTests()}
				>
					🔄 Refresh Tests
				</Button>

				<Button
					variant="secondary"
					fullWidth
					onClick={() => window.open(`${config.api.baseUrl}/health`, '_blank')}
				>
					🩺 Check API Health
				</Button>

				<Button
					variant="secondary"
					fullWidth
					onClick={() => window.location.reload()}
				>
					♻️ Reload Dashboard
				</Button>

				{isRunningAllTests && (
					<>
						<Button
							variant="secondary"
							fullWidth
							onClick={() => setRunningAllTests(false)}
							className="bg-orange-600 text-white hover:bg-orange-700"
						>
							🔧 Force Enable Buttons (Client)
						</Button>
						<Button
							variant="danger"
							fullWidth
							loading={forceResetting}
							disabled={forceResetting}
							onClick={forceResetProcesses}
						>
							{forceResetting ? 'Resetting...' : '🚨 Force Reset Server Processes'}
						</Button>
					</>
				)}

				<Button
					variant="danger"
					fullWidth
					loading={clearingData}
					disabled={isAnyTestRunning || clearingData}
					onClick={clearAllData}
				>
					{clearingData ? 'Clearing...' : '🗑️ Clear All Data'}
				</Button>
			</div>
		</div>
	)
}
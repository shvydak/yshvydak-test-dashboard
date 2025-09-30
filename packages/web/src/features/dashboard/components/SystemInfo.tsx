import { Card, CardHeader, CardContent } from '@shared/components'
import { config } from '@config/environment.config'

export function SystemInfo() {
	return (
		<Card>
			<CardHeader>
				<h3 className="card-title">System Information</h3>
				<p className="card-description">Runtime and environment details</p>
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
					<div>
						<span className="font-medium text-gray-900 dark:text-white">
							API Server:
						</span>
						<span className="ml-2 text-gray-600 dark:text-gray-400">
							{config.api.serverUrl.replace('http://', '')}
						</span>
					</div>
					<div>
						<span className="font-medium text-gray-900 dark:text-white">
							Frontend:
						</span>
						<span className="ml-2 text-gray-600 dark:text-gray-400">
							React + Vite
						</span>
					</div>
					<div>
						<span className="font-medium text-gray-900 dark:text-white">
							Version:
						</span>
						<span className="ml-2 text-gray-600 dark:text-gray-400">
							1.0.0
						</span>
					</div>
				</div>
			</CardContent>
		</Card>
	)
}
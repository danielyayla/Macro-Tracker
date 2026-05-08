import { type MCP } from './index.ts'
import { registerKetoLogAppResource } from './resources/keto-log-app-resource.ts'

export async function registerResources(agent: MCP) {
	await registerKetoLogAppResource(agent)
}

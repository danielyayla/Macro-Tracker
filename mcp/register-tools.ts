import { type MCP } from './index.ts'
import { registerDeleteEntryTool } from './tools/delete-entry.ts'
import { registerGetLogTool } from './tools/get-log.ts'
import { registerGetGoalsTool, registerSetGoalsTool } from './tools/goals.ts'
import { registerLogFoodTool } from './tools/log-food.ts'
import { registerLogGlucoseTool } from './tools/log-glucose.ts'
import { registerLogKetoneTool } from './tools/log-ketone.ts'
import { registerOpenLogUiTool } from './tools/open-log-ui.ts'
import { registerUpdateEntryTool } from './tools/update-entry.ts'

export async function registerTools(agent: MCP) {
	await registerLogFoodTool(agent)
	await registerLogKetoneTool(agent)
	await registerLogGlucoseTool(agent)
	await registerUpdateEntryTool(agent)
	await registerDeleteEntryTool(agent)
	await registerGetLogTool(agent)
	await registerSetGoalsTool(agent)
	await registerGetGoalsTool(agent)
	await registerOpenLogUiTool(agent)
}

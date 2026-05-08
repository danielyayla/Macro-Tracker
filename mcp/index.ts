import { invariant } from '@epic-web/invariant'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker-provider.js'
import { McpAgent } from 'agents/mcp'
import { parseMcpCallerContext, type McpServerProps } from './context.ts'
import { registerResources } from './register-resources.ts'
import { registerTools } from './register-tools.ts'

export type State = {}
export type Props = McpServerProps

const serverMetadata = {
	implementation: {
		name: 'macro-tracker-mcp',
		version: '1.0.0',
	},
	instructions: `
This server tracks a user's ketogenic diet: food, ketone readings, and blood
glucose readings. Each user has their own log scoped by the connected account.

Quick start
- After analyzing a food photo or text description, call 'log_food' with the
	macros (kcal, fat_g, carbs_g; ideally fiber_g and protein_g too).
- Call 'log_ketone' / 'log_glucose' when the user reports a meter reading.
	Always include the device unit — units are not interchangeable.
- Call 'get_log' to read today's interleaved timeline with running totals and
	the latest GKI (Glucose Ketone Index).
- Call 'open_log_ui' when an MCP App compatible host can render an interactive
	timeline widget.
- Call 'update_entry' / 'delete_entry' to fix mistakes. Use 'get_log' first to
	find the entry id.
- Call 'get_goals' / 'set_goals' to read or change daily targets and the user's
	target ketone range.

How to chain tools safely
- 'get_log' is the single source of truth for what's already logged today.
	Re-run it after any write to confirm.
- All write tools echo the saved row in structuredContent.entry, so you can
	confirm without a follow-up read.
	`.trim(),
} as const

export class MCP extends McpAgent<Env, State, Props> {
	server = new McpServer(serverMetadata.implementation, {
		instructions: serverMetadata.instructions,
		jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
	})
	async init() {
		await registerResources(this)
		await registerTools(this)
	}
	getCallerContext() {
		return parseMcpCallerContext(this.props)
	}
	requireDomain() {
		const { baseUrl } = this.getCallerContext()
		invariant(
			baseUrl,
			'This should never happen, but somehow we did not get the baseUrl from the request handler',
		)
		return baseUrl
	}
}

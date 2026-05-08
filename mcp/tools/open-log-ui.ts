import { registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import { type ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { ketoLogUiResourceUri } from '#mcp/apps/keto-log-ui-entry-point.ts'
import { type MCP } from '#mcp/index.ts'

const openLogUiTool = {
	name: 'open_log_ui',
	title: 'Open Keto Log UI',
	description: `
Show an interactive keto-log MCP App widget.

Behavior:
- Opens today's timeline of food, ketone, and glucose entries with running totals
	and progress against daily goals.
- The widget is read-only inside the chat; the user can click an entry to open the
	full app for editing.

Next:
- Use 'get_log' when you need a precise, machine-readable result in tool output.
	`.trim(),
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	} satisfies ToolAnnotations,
} as const

export async function registerOpenLogUiTool(agent: MCP) {
	registerAppTool(
		agent.server,
		openLogUiTool.name,
		{
			title: openLogUiTool.title,
			description: openLogUiTool.description,
			annotations: openLogUiTool.annotations,
			_meta: {
				ui: {
					resourceUri: ketoLogUiResourceUri,
				},
			},
		},
		async () => {
			return {
				content: [
					{
						type: 'text' as const,
						text: `
## Keto log widget ready

Today's timeline is attached to this tool call.

- The widget refreshes itself when entries are added or edited.
- Click an entry to jump into the full app for edits.
						`.trim(),
					},
				],
				structuredContent: {
					widget: 'keto-log',
					resourceUri: ketoLogUiResourceUri,
				},
			}
		},
	)
}

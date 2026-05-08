import { type ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { type MCP } from '#mcp/index.ts'
import { entryKinds } from '#shared/keto-log.ts'
import {
	notFoundResult,
	resolveToolContext,
	unauthenticatedResult,
} from './keto-common.ts'

const deleteEntryTool = {
	name: 'delete_entry',
	title: 'Delete Log Entry',
	description: `
Soft-delete a food, ketone, or glucose entry by id.

Behavior:
- Entries are hidden from get_log and the web UI but kept in the database for
	auditing.
- Use 'get_log' first to find the id you want to delete.
	`.trim(),
	annotations: {
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: true,
		openWorldHint: false,
	} satisfies ToolAnnotations,
} as const

export async function registerDeleteEntryTool(agent: MCP) {
	agent.server.registerTool(
		deleteEntryTool.name,
		{
			title: deleteEntryTool.title,
			description: deleteEntryTool.description,
			inputSchema: {
				kind: z.enum(entryKinds).describe('Type of entry to delete.'),
				id: z.number().int().positive().describe('Entry id from get_log.'),
			},
			annotations: deleteEntryTool.annotations,
		},
		async ({ kind, id }) => {
			const context = resolveToolContext(agent)
			if (!context) return unauthenticatedResult()

			const deleted = await context.store.softDelete(context.userId, kind, id)
			if (!deleted) return notFoundResult(kind, id)

			return {
				content: [
					{
						type: 'text' as const,
						text: `## 🗑️ Deleted ${kind} entry ${id}`,
					},
				],
				structuredContent: { deleted: true, kind, id },
			}
		},
	)
}

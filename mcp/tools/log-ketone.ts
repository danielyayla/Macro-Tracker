import { type ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { type MCP } from '#mcp/index.ts'
import { ketoneUnits } from '#shared/keto-log.ts'
import {
	describeKetoneUnit,
	formatNumber,
	isoOrNow,
	resolveToolContext,
	unauthenticatedResult,
} from './keto-common.ts'

const logKetoneTool = {
	name: 'log_ketone',
	title: 'Log Ketone Reading',
	description: `
Record a ketone reading from the user's meter or strip.

Use the unit that matches the device — the three units are NOT interchangeable:
- mmol_L_blood — most common; from a blood ketone meter (Keto-Mojo, etc.)
- ppm_breath — from a breath acetone analyzer (Ketonix, BIOSENSE)
- mg_dL_urine — from urine strips (least reliable; only useful early in keto)

Behavior:
- measured_at defaults to now (UTC).
- The unit is stored alongside the value; we never normalize across units on write.
	`.trim(),
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	} satisfies ToolAnnotations,
} as const

export async function registerLogKetoneTool(agent: MCP) {
	agent.server.registerTool(
		logKetoneTool.name,
		{
			title: logKetoneTool.title,
			description: logKetoneTool.description,
			inputSchema: {
				value: z
					.number()
					.finite()
					.min(0)
					.describe('Numeric reading from the device.'),
				unit: z
					.enum(ketoneUnits)
					.describe('Measurement unit. Must match the device used.'),
				measured_at: z
					.string()
					.optional()
					.describe('ISO 8601 timestamp. Defaults to now.'),
				notes: z.string().max(2000).optional().describe('Optional context.'),
			},
			annotations: logKetoneTool.annotations,
		},
		async ({ value, unit, measured_at, notes }) => {
			const context = resolveToolContext(agent)
			if (!context) return unauthenticatedResult()

			const measuredAtIso = isoOrNow(measured_at)
			const entry = await context.store.logKetone(context.userId, {
				value,
				unit,
				measuredAt: measuredAtIso,
				notes,
			})

			return {
				content: [
					{
						type: 'text' as const,
						text: `
## ✅ Logged ketone reading

- **${formatNumber(entry.value, 2)} ${describeKetoneUnit(entry.unit)}**
- Measured at: ${entry.measuredAt}
- Entry id: ${entry.id}
						`.trim(),
					},
				],
				structuredContent: { entry },
			}
		},
	)
}

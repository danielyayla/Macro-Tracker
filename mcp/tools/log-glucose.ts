import { type ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { type MCP } from '#mcp/index.ts'
import { glucoseUnits } from '#shared/keto-log.ts'
import {
	describeGlucoseUnit,
	formatNumber,
	isoOrNow,
	resolveToolContext,
	unauthenticatedResult,
} from './keto-common.ts'

const logGlucoseTool = {
	name: 'log_glucose',
	title: 'Log Glucose Reading',
	description: `
Record a blood glucose reading from a meter or CGM.

Behavior:
- measured_at defaults to now (UTC).
- Pass the unit reported by the device. mg/dL is common in the US; mmol/L is
	common elsewhere (1 mmol/L ≈ 18 mg/dL).
	`.trim(),
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	} satisfies ToolAnnotations,
} as const

export async function registerLogGlucoseTool(agent: MCP) {
	agent.server.registerTool(
		logGlucoseTool.name,
		{
			title: logGlucoseTool.title,
			description: logGlucoseTool.description,
			inputSchema: {
				value: z
					.number()
					.finite()
					.min(0)
					.describe('Numeric reading from the device.'),
				unit: z.enum(glucoseUnits).describe('Measurement unit.'),
				measured_at: z
					.string()
					.optional()
					.describe('ISO 8601 timestamp. Defaults to now.'),
				notes: z.string().max(2000).optional().describe('Optional context.'),
			},
			annotations: logGlucoseTool.annotations,
		},
		async ({ value, unit, measured_at, notes }) => {
			const context = resolveToolContext(agent)
			if (!context) return unauthenticatedResult()

			const measuredAtIso = isoOrNow(measured_at)
			const entry = await context.store.logGlucose(context.userId, {
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
## ✅ Logged glucose reading

- **${formatNumber(entry.value, 1)} ${describeGlucoseUnit(entry.unit)}**
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

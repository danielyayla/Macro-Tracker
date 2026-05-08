import { type ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { type MCP } from '#mcp/index.ts'
import {
	formatNumber,
	isoOrNow,
	resolveToolContext,
	unauthenticatedResult,
} from './keto-common.ts'

const logFoodTool = {
	name: 'log_food',
	title: 'Log Food',
	description: `
Record a single food the user just ate (or ate at a specific time).

Use after analyzing a food photo or text description. Provide kcal, fat_g, and
carbs_g at minimum. Pass fiber_g when known so net carbs are accurate, and
protein_g so the user can watch for excess (gluconeogenesis can break ketosis).

Behavior:
- eaten_at defaults to now (UTC). Pass an ISO 8601 timestamp to log retroactively.
- raw_json is optional; pass the full structured analysis (per-ingredient breakdown,
	confidence, etc.) if you have it, for the user's audit trail.
- Net carbs = max(0, carbs_g - fiber_g).

Next:
- Use 'log_ketone' or 'log_glucose' to add readings around this meal.
- Use 'get_log' to see today's running totals or Claude-friendly timeline.
- Use 'open_log_ui' to show the user their interactive timeline.
	`.trim(),
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	} satisfies ToolAnnotations,
} as const

export async function registerLogFoodTool(agent: MCP) {
	agent.server.registerTool(
		logFoodTool.name,
		{
			title: logFoodTool.title,
			description: logFoodTool.description,
			inputSchema: {
				name: z
					.string()
					.min(1)
					.max(200)
					.describe('Short food name. Example: "Bunless cheeseburger"'),
				kcal: z
					.number()
					.finite()
					.min(0)
					.describe('Total energy in kilocalories.'),
				fat_g: z.number().finite().min(0).describe('Total fat in grams.'),
				carbs_g: z
					.number()
					.finite()
					.min(0)
					.describe('Total carbohydrates in grams (including fiber).'),
				fiber_g: z
					.number()
					.finite()
					.min(0)
					.optional()
					.default(0)
					.describe(
						'Fiber in grams. Used to compute net carbs. Default 0 if unknown.',
					),
				protein_g: z
					.number()
					.finite()
					.min(0)
					.optional()
					.default(0)
					.describe(
						'Protein in grams. Excess protein can affect ketosis via gluconeogenesis.',
					),
				eaten_at: z
					.string()
					.optional()
					.describe('ISO 8601 timestamp. Defaults to now.'),
				serving: z
					.string()
					.max(120)
					.optional()
					.describe('Free text serving description. Example: "1 cup", "150g".'),
				notes: z
					.string()
					.max(2000)
					.optional()
					.describe('Optional user-facing notes.'),
				raw_json: z
					.string()
					.max(20_000)
					.optional()
					.describe('Optional JSON string with the full structured analysis.'),
			},
			annotations: logFoodTool.annotations,
		},
		async ({
			name,
			kcal,
			fat_g,
			carbs_g,
			fiber_g,
			protein_g,
			eaten_at,
			serving,
			notes,
			raw_json,
		}) => {
			const context = resolveToolContext(agent)
			if (!context) return unauthenticatedResult()

			const eatenAtIso = isoOrNow(eaten_at)
			const entry = await context.store.logFood(context.userId, {
				name,
				kcal,
				fatG: fat_g,
				carbsG: carbs_g,
				fiberG: fiber_g,
				proteinG: protein_g,
				eatenAt: eatenAtIso,
				serving,
				notes,
				rawJson: raw_json ?? null,
			})

			return {
				content: [
					{
						type: 'text' as const,
						text: `
## ✅ Logged food

- **${entry.name}**${entry.serving ? ` (${entry.serving})` : ''}
- ${formatNumber(entry.kcal)} kcal · ${formatNumber(entry.fatG)} g fat · ${formatNumber(entry.carbsG)} g carbs (${formatNumber(entry.netCarbsG)} g net) · ${formatNumber(entry.proteinG)} g protein
- Eaten at: ${entry.eatenAt}
- Entry id: ${entry.id}
						`.trim(),
					},
				],
				structuredContent: { entry },
			}
		},
	)
}

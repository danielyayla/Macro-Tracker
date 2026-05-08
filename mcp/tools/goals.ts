import { type ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { type MCP } from '#mcp/index.ts'
import {
	endOfTodayIso,
	formatNumber,
	resolveToolContext,
	startOfTodayIso,
	unauthenticatedResult,
} from './keto-common.ts'

const setGoalsTool = {
	name: 'set_goals',
	title: 'Set Daily Goals',
	description: `
Set or update the user's daily targets and ketone target range.

Pass only the fields you want to change. Pass null to clear a goal.

Behavior:
- daily_net_carbs_g is for net carbs (carbs - fiber), not total carbs.
- ketone_target_min/max is in mmol/L blood ketones by convention.
	`.trim(),
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	} satisfies ToolAnnotations,
} as const

const getGoalsTool = {
	name: 'get_goals',
	title: 'Get Daily Goals',
	description: `
Read the user's daily targets and today's progress.

Returns:
- The configured daily_kcal / daily_fat_g / daily_net_carbs_g / daily_protein_g.
- The configured ketone_target_min/max range.
- Today's totals so you can compare progress against goals.
	`.trim(),
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	} satisfies ToolAnnotations,
} as const

const goalNumber = z.number().finite().min(0).nullable().optional()

function progressLine(label: string, current: number, target: number | null) {
	if (target === null) return `- ${label}: ${formatNumber(current)} (no goal)`
	const remaining = Math.max(0, target - current)
	return `- ${label}: ${formatNumber(current)} / ${formatNumber(target)} (${formatNumber(remaining)} remaining)`
}

export async function registerSetGoalsTool(agent: MCP) {
	agent.server.registerTool(
		setGoalsTool.name,
		{
			title: setGoalsTool.title,
			description: setGoalsTool.description,
			inputSchema: {
				daily_kcal: goalNumber.describe('Daily energy target in kcal.'),
				daily_fat_g: goalNumber.describe('Daily fat target in grams.'),
				daily_net_carbs_g: goalNumber.describe(
					'Daily net carbs cap in grams (carbs - fiber).',
				),
				daily_protein_g: goalNumber.describe('Daily protein target in grams.'),
				ketone_target_min: goalNumber.describe(
					'Lower end of target ketosis range, mmol/L blood.',
				),
				ketone_target_max: goalNumber.describe(
					'Upper end of target ketosis range, mmol/L blood.',
				),
			},
			annotations: setGoalsTool.annotations,
		},
		async (input) => {
			const context = resolveToolContext(agent)
			if (!context) return unauthenticatedResult()

			const goals = await context.store.setGoals(context.userId, {
				dailyKcal: input.daily_kcal,
				dailyFatG: input.daily_fat_g,
				dailyNetCarbsG: input.daily_net_carbs_g,
				dailyProteinG: input.daily_protein_g,
				ketoneTargetMin: input.ketone_target_min,
				ketoneTargetMax: input.ketone_target_max,
			})

			return {
				content: [
					{
						type: 'text' as const,
						text: `## ✅ Saved goals\n\n${JSON.stringify(goals, null, 2)}`,
					},
				],
				structuredContent: { goals },
			}
		},
	)
}

export async function registerGetGoalsTool(agent: MCP) {
	agent.server.registerTool(
		getGoalsTool.name,
		{
			title: getGoalsTool.title,
			description: getGoalsTool.description,
			inputSchema: {},
			annotations: getGoalsTool.annotations,
		},
		async () => {
			const context = resolveToolContext(agent)
			if (!context) return unauthenticatedResult()

			const range = await context.store.listRange(context.userId, {
				from: startOfTodayIso(),
				to: endOfTodayIso(),
			})

			const lines = [
				'## Today vs goals',
				'',
				progressLine(
					'Calories (kcal)',
					range.totals.kcal,
					range.goals.dailyKcal,
				),
				progressLine('Fat (g)', range.totals.fatG, range.goals.dailyFatG),
				progressLine(
					'Net carbs (g)',
					range.totals.netCarbsG,
					range.goals.dailyNetCarbsG,
				),
				progressLine(
					'Protein (g)',
					range.totals.proteinG,
					range.goals.dailyProteinG,
				),
			]
			if (
				range.goals.ketoneTargetMin !== null ||
				range.goals.ketoneTargetMax !== null
			) {
				lines.push(
					`- Ketone target: ${formatNumber(range.goals.ketoneTargetMin ?? 0, 2)} – ${formatNumber(range.goals.ketoneTargetMax ?? 0, 2)} mmol/L (blood)`,
				)
			}

			return {
				content: [
					{
						type: 'text' as const,
						text: lines.join('\n'),
					},
				],
				structuredContent: {
					goals: range.goals,
					totals: range.totals,
				},
			}
		},
	)
}

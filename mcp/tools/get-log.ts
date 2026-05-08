import { type ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { type MCP } from '#mcp/index.ts'
import { computeGki, entryKinds, type AnyEntry } from '#shared/keto-log.ts'
import {
	describeGlucoseUnit,
	describeKetoneUnit,
	endOfTodayIso,
	formatNumber,
	isoOrNow,
	resolveToolContext,
	startOfTodayIso,
	unauthenticatedResult,
} from './keto-common.ts'

const getLogTool = {
	name: 'get_log',
	title: 'Get Keto Log',
	description: `
Read the user's interleaved food, ketone, and glucose timeline for a date range.

Behavior:
- Default range is "today" (UTC midnight to next midnight) when from/to omitted.
- Returns entries sorted by timestamp, daily food totals (kcal, fat, carbs, fiber,
	net carbs, protein), the user's goals, and the most recent GKI (Glucose Ketone
	Index) when both a glucose and a blood-ketone reading exist in range.
- Use 'kinds' to limit to a subset, e.g. just ['ketone', 'glucose'] to inspect
	correlations.
	`.trim(),
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	} satisfies ToolAnnotations,
} as const

function entryTimestamp(entry: AnyEntry) {
	return entry.kind === 'food' ? entry.eatenAt : entry.measuredAt
}

function summarizeEntry(entry: AnyEntry) {
	const at = entryTimestamp(entry)
	if (entry.kind === 'food') {
		return `- ${at} · 🍽️ ${entry.name}${entry.serving ? ` (${entry.serving})` : ''} — ${formatNumber(entry.kcal)} kcal, ${formatNumber(entry.netCarbsG)} g net carbs, ${formatNumber(entry.fatG)} g fat, ${formatNumber(entry.proteinG)} g protein _(id ${entry.id})_`
	}
	if (entry.kind === 'ketone') {
		return `- ${at} · 🩸 ketone ${formatNumber(entry.value, 2)} ${describeKetoneUnit(entry.unit)} _(id ${entry.id})_`
	}
	return `- ${at} · 📊 glucose ${formatNumber(entry.value, 1)} ${describeGlucoseUnit(entry.unit)} _(id ${entry.id})_`
}

function findLatestGkiPair(entries: ReadonlyArray<AnyEntry>) {
	let lastKetone: Extract<AnyEntry, { kind: 'ketone' }> | null = null
	let lastGlucose: Extract<AnyEntry, { kind: 'glucose' }> | null = null
	for (const entry of entries) {
		if (entry.kind === 'ketone') lastKetone = entry
		else if (entry.kind === 'glucose') lastGlucose = entry
	}
	if (!lastKetone || !lastGlucose) return null
	const gki = computeGki(
		{ value: lastGlucose.value, unit: lastGlucose.unit },
		{ value: lastKetone.value, unit: lastKetone.unit },
	)
	if (gki === null) return null
	return { gki, ketone: lastKetone, glucose: lastGlucose }
}

export async function registerGetLogTool(agent: MCP) {
	agent.server.registerTool(
		getLogTool.name,
		{
			title: getLogTool.title,
			description: getLogTool.description,
			inputSchema: {
				from: z
					.string()
					.optional()
					.describe(
						'ISO 8601 start of range (inclusive). Defaults to start of today (UTC).',
					),
				to: z
					.string()
					.optional()
					.describe(
						'ISO 8601 end of range (exclusive). Defaults to end of today (UTC).',
					),
				kinds: z
					.array(z.enum(entryKinds))
					.optional()
					.describe('Subset of entry kinds to include. Defaults to all three.'),
			},
			annotations: getLogTool.annotations,
		},
		async ({ from, to, kinds }) => {
			const context = resolveToolContext(agent)
			if (!context) return unauthenticatedResult()

			const fromIso = from ? isoOrNow(from) : startOfTodayIso()
			const toIso = to ? isoOrNow(to) : endOfTodayIso()
			const range = await context.store.listRange(context.userId, {
				from: fromIso,
				to: toIso,
				kinds,
			})
			const gkiPair = findLatestGkiPair(range.entries)

			const lines: Array<string> = []
			lines.push(`## Keto log: ${fromIso} → ${toIso}`)
			lines.push('')
			lines.push(
				`**Totals**: ${formatNumber(range.totals.kcal)} kcal · ${formatNumber(range.totals.fatG)} g fat · ${formatNumber(range.totals.netCarbsG)} g net carbs · ${formatNumber(range.totals.proteinG)} g protein`,
			)
			if (gkiPair) {
				lines.push(
					`**Latest GKI**: ${formatNumber(gkiPair.gki, 2)} (glucose ${formatNumber(gkiPair.glucose.value, 1)} ${describeGlucoseUnit(gkiPair.glucose.unit)} ÷ ketones ${formatNumber(gkiPair.ketone.value, 2)} ${describeKetoneUnit(gkiPair.ketone.unit)})`,
				)
			}
			if (range.entries.length === 0) {
				lines.push('')
				lines.push('_No entries in range._')
			} else {
				lines.push('')
				for (const entry of range.entries) lines.push(summarizeEntry(entry))
			}

			return {
				content: [
					{
						type: 'text' as const,
						text: lines.join('\n'),
					},
				],
				structuredContent: {
					from: fromIso,
					to: toIso,
					totals: range.totals,
					goals: range.goals,
					entries: range.entries,
					latestGki: gkiPair
						? {
								gki: gkiPair.gki,
								glucoseId: gkiPair.glucose.id,
								ketoneId: gkiPair.ketone.id,
							}
						: null,
				},
			}
		},
	)
}

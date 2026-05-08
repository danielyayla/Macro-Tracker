import { type ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { type MCP } from '#mcp/index.ts'
import { entryKinds, glucoseUnits, ketoneUnits } from '#shared/keto-log.ts'
import {
	notFoundResult,
	resolveToolContext,
	unauthenticatedResult,
} from './keto-common.ts'

const updateEntryTool = {
	name: 'update_entry',
	title: 'Update Log Entry',
	description: `
Edit an existing food, ketone, or glucose entry by id.

Pass a 'patch' object with only the fields you want to change. Fields not
included are left as-is. Use 'get_log' to find the entry id.

For food entries: name, eaten_at, serving, kcal, fat_g, carbs_g, fiber_g,
protein_g, notes, raw_json.
For ketone/glucose entries: value, unit, measured_at, notes.
	`.trim(),
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	} satisfies ToolAnnotations,
} as const

const foodPatchSchema = z
	.object({
		name: z.string().min(1).max(200).optional(),
		eaten_at: z.string().optional(),
		serving: z.string().max(120).optional(),
		kcal: z.number().finite().min(0).optional(),
		fat_g: z.number().finite().min(0).optional(),
		carbs_g: z.number().finite().min(0).optional(),
		fiber_g: z.number().finite().min(0).optional(),
		protein_g: z.number().finite().min(0).optional(),
		notes: z.string().max(2000).optional(),
		raw_json: z.string().max(20_000).nullable().optional(),
	})
	.strict()

const ketonePatchSchema = z
	.object({
		value: z.number().finite().min(0).optional(),
		unit: z.enum(ketoneUnits).optional(),
		measured_at: z.string().optional(),
		notes: z.string().max(2000).optional(),
	})
	.strict()

const glucosePatchSchema = z
	.object({
		value: z.number().finite().min(0).optional(),
		unit: z.enum(glucoseUnits).optional(),
		measured_at: z.string().optional(),
		notes: z.string().max(2000).optional(),
	})
	.strict()

export async function registerUpdateEntryTool(agent: MCP) {
	agent.server.registerTool(
		updateEntryTool.name,
		{
			title: updateEntryTool.title,
			description: updateEntryTool.description,
			inputSchema: {
				kind: z.enum(entryKinds).describe('Type of entry to edit.'),
				id: z.number().int().positive().describe('Entry id from get_log.'),
				patch: z
					.union([foodPatchSchema, ketonePatchSchema, glucosePatchSchema])
					.describe(
						'Object with only the fields to change. Shape depends on kind.',
					),
			},
			annotations: updateEntryTool.annotations,
		},
		async ({ kind, id, patch }) => {
			const context = resolveToolContext(agent)
			if (!context) return unauthenticatedResult()

			if (kind === 'food') {
				const result = foodPatchSchema.safeParse(patch)
				if (!result.success) {
					return {
						content: [
							{
								type: 'text' as const,
								text: '❌ patch fields are not valid for a food entry.',
							},
						],
						structuredContent: {
							error: 'INVALID_PATCH' as const,
							issues: result.error.issues,
						},
						isError: true as const,
					}
				}
				const updated = await context.store.updateFood(context.userId, id, {
					name: result.data.name,
					eatenAt: result.data.eaten_at,
					serving: result.data.serving,
					kcal: result.data.kcal,
					fatG: result.data.fat_g,
					carbsG: result.data.carbs_g,
					fiberG: result.data.fiber_g,
					proteinG: result.data.protein_g,
					notes: result.data.notes,
					rawJson: result.data.raw_json,
				})
				if (!updated) return notFoundResult('food', id)
				return {
					content: [
						{
							type: 'text' as const,
							text: `## ✅ Updated food entry ${id}`,
						},
					],
					structuredContent: { entry: updated },
				}
			}

			if (kind === 'ketone') {
				const result = ketonePatchSchema.safeParse(patch)
				if (!result.success) {
					return {
						content: [
							{
								type: 'text' as const,
								text: '❌ patch fields are not valid for a ketone entry.',
							},
						],
						structuredContent: {
							error: 'INVALID_PATCH' as const,
							issues: result.error.issues,
						},
						isError: true as const,
					}
				}
				const updated = await context.store.updateKetone(context.userId, id, {
					value: result.data.value,
					unit: result.data.unit,
					measuredAt: result.data.measured_at,
					notes: result.data.notes,
				})
				if (!updated) return notFoundResult('ketone', id)
				return {
					content: [
						{
							type: 'text' as const,
							text: `## ✅ Updated ketone entry ${id}`,
						},
					],
					structuredContent: { entry: updated },
				}
			}

			const result = glucosePatchSchema.safeParse(patch)
			if (!result.success) {
				return {
					content: [
						{
							type: 'text' as const,
							text: '❌ patch fields are not valid for a glucose entry.',
						},
					],
					structuredContent: {
						error: 'INVALID_PATCH' as const,
						issues: result.error.issues,
					},
					isError: true as const,
				}
			}
			const updated = await context.store.updateGlucose(context.userId, id, {
				value: result.data.value,
				unit: result.data.unit,
				measuredAt: result.data.measured_at,
				notes: result.data.notes,
			})
			if (!updated) return notFoundResult('glucose', id)
			return {
				content: [
					{
						type: 'text' as const,
						text: `## ✅ Updated glucose entry ${id}`,
					},
				],
				structuredContent: { entry: updated },
			}
		},
	)
}

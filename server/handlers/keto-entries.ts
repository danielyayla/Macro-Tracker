import { type BuildAction } from 'remix/fetch-router'
import { readAuthenticatedAppUser } from '#server/authenticated-user.ts'
import {
	createKetoLogStore,
	type FoodEntryPatch,
	type GlucoseEntryPatch,
	type KetoneEntryPatch,
} from '#server/keto-log.ts'
import { type routes } from '#server/routes.ts'
import {
	computeGki,
	entryKinds,
	glucoseUnits,
	isEntryKind,
	isGlucoseUnit,
	isKetoneUnit,
	type EntryKind,
} from '#shared/keto-log.ts'
import { type AppEnv } from '#types/env-schema.ts'

function jsonResponse(data: unknown, init?: ResponseInit) {
	return new Response(JSON.stringify(data), {
		...init,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-store',
			...init?.headers,
		},
	})
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value)
}

function readIso(value: unknown): string | undefined {
	if (typeof value !== 'string' || !value.trim()) return undefined
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return undefined
	return date.toISOString()
}

function startOfTodayIso() {
	const start = new Date()
	start.setHours(0, 0, 0, 0)
	return start.toISOString()
}

function endOfTodayIso() {
	const end = new Date()
	end.setHours(0, 0, 0, 0)
	end.setDate(end.getDate() + 1)
	return end.toISOString()
}

export function createKetoEntriesHandler(appEnv: AppEnv) {
	const store = createKetoLogStore(appEnv.APP_DB)
	return {
		middleware: [],
		async handler({ request }) {
			const user = await readAuthenticatedAppUser(request, appEnv as Env)
			if (!user) {
				return jsonResponse(
					{ ok: false, error: 'Unauthorized' },
					{ status: 401 },
				)
			}

			if (request.method === 'GET') {
				const url = new URL(request.url)
				const fromIso =
					readIso(url.searchParams.get('from')) ?? startOfTodayIso()
				const toIso = readIso(url.searchParams.get('to')) ?? endOfTodayIso()
				const kinds: Array<EntryKind> = url.searchParams
					.getAll('kind')
					.filter(isEntryKind)

				const range = await store.listRange(user.userId, {
					from: fromIso,
					to: toIso,
					kinds: kinds.length > 0 ? kinds : undefined,
				})

				let latestKetone: { id: number; value: number; unit: string } | null =
					null
				let latestGlucose: { id: number; value: number; unit: string } | null =
					null
				for (const entry of range.entries) {
					if (entry.kind === 'ketone') {
						latestKetone = {
							id: entry.id,
							value: entry.value,
							unit: entry.unit,
						}
					} else if (entry.kind === 'glucose') {
						latestGlucose = {
							id: entry.id,
							value: entry.value,
							unit: entry.unit,
						}
					}
				}
				const gkiValue =
					latestKetone && latestGlucose
						? computeGki(
								{
									value: latestGlucose.value,
									unit: latestGlucose.unit as never,
								},
								{ value: latestKetone.value, unit: latestKetone.unit as never },
							)
						: null
				const latestGki =
					latestKetone && latestGlucose && gkiValue !== null
						? {
								gki: gkiValue,
								glucoseId: latestGlucose.id,
								ketoneId: latestKetone.id,
							}
						: null

				return jsonResponse({ ok: true, ...range, latestGki })
			}

			let body: unknown
			try {
				body = await request.json()
			} catch {
				return jsonResponse(
					{ ok: false, error: 'Invalid JSON payload.' },
					{ status: 400 },
				)
			}
			if (!body || typeof body !== 'object') {
				return jsonResponse(
					{ ok: false, error: 'Body must be an object.' },
					{ status: 400 },
				)
			}
			const data = body as Record<string, unknown>
			if (!isEntryKind(data.kind)) {
				return jsonResponse(
					{
						ok: false,
						error: `kind must be one of: ${entryKinds.join(', ')}`,
					},
					{ status: 400 },
				)
			}

			if (data.kind === 'food') {
				if (typeof data.name !== 'string' || !data.name.trim()) {
					return jsonResponse(
						{ ok: false, error: 'name is required.' },
						{ status: 400 },
					)
				}
				if (
					!isFiniteNumber(data.kcal) ||
					!isFiniteNumber(data.fat_g) ||
					!isFiniteNumber(data.carbs_g)
				) {
					return jsonResponse(
						{
							ok: false,
							error: 'kcal, fat_g, and carbs_g are required numbers.',
						},
						{ status: 400 },
					)
				}
				const entry = await store.logFood(user.userId, {
					name: data.name,
					eatenAt: readIso(data.eaten_at),
					serving: typeof data.serving === 'string' ? data.serving : undefined,
					kcal: data.kcal,
					fatG: data.fat_g,
					carbsG: data.carbs_g,
					fiberG: isFiniteNumber(data.fiber_g) ? data.fiber_g : undefined,
					proteinG: isFiniteNumber(data.protein_g) ? data.protein_g : undefined,
					notes: typeof data.notes === 'string' ? data.notes : undefined,
					rawJson:
						typeof data.raw_json === 'string' ? data.raw_json : undefined,
					source: 'web',
				})
				return jsonResponse({ ok: true, entry }, { status: 201 })
			}

			if (data.kind === 'ketone') {
				if (!isFiniteNumber(data.value) || !isKetoneUnit(data.unit)) {
					return jsonResponse(
						{ ok: false, error: 'value and a valid unit are required.' },
						{ status: 400 },
					)
				}
				const entry = await store.logKetone(user.userId, {
					value: data.value,
					unit: data.unit,
					measuredAt: readIso(data.measured_at),
					notes: typeof data.notes === 'string' ? data.notes : undefined,
					source: 'web',
				})
				return jsonResponse({ ok: true, entry }, { status: 201 })
			}

			if (!isFiniteNumber(data.value) || !isGlucoseUnit(data.unit)) {
				return jsonResponse(
					{
						ok: false,
						error: `value is required, unit must be one of: ${glucoseUnits.join(', ')}`,
					},
					{ status: 400 },
				)
			}
			const entry = await store.logGlucose(user.userId, {
				value: data.value,
				unit: data.unit,
				measuredAt: readIso(data.measured_at),
				notes: typeof data.notes === 'string' ? data.notes : undefined,
				source: 'web',
			})
			return jsonResponse({ ok: true, entry }, { status: 201 })
		},
	} satisfies BuildAction<
		typeof routes.ketoEntriesCreate.method | typeof routes.ketoEntries.method,
		typeof routes.ketoEntries.pattern
	>
}

export function createKetoEntriesUpdateHandler(appEnv: AppEnv) {
	const store = createKetoLogStore(appEnv.APP_DB)
	return {
		middleware: [],
		async handler({ request }) {
			const user = await readAuthenticatedAppUser(request, appEnv as Env)
			if (!user) {
				return jsonResponse(
					{ ok: false, error: 'Unauthorized' },
					{ status: 401 },
				)
			}
			let body: unknown
			try {
				body = await request.json()
			} catch {
				return jsonResponse(
					{ ok: false, error: 'Invalid JSON payload.' },
					{ status: 400 },
				)
			}
			if (!body || typeof body !== 'object') {
				return jsonResponse(
					{ ok: false, error: 'Body must be an object.' },
					{ status: 400 },
				)
			}
			const data = body as Record<string, unknown>
			if (!isEntryKind(data.kind) || !isFiniteNumber(data.id) || data.id <= 0) {
				return jsonResponse(
					{ ok: false, error: 'kind and id are required.' },
					{ status: 400 },
				)
			}
			const id = Math.floor(data.id)
			const patch =
				data.patch && typeof data.patch === 'object'
					? (data.patch as Record<string, unknown>)
					: {}

			if (data.kind === 'food') {
				const foodPatch: FoodEntryPatch = {}
				if (typeof patch.name === 'string') foodPatch.name = patch.name
				const eatenAt = readIso(patch.eaten_at)
				if (eatenAt !== undefined) foodPatch.eatenAt = eatenAt
				if (typeof patch.serving === 'string') foodPatch.serving = patch.serving
				if (isFiniteNumber(patch.kcal)) foodPatch.kcal = patch.kcal
				if (isFiniteNumber(patch.fat_g)) foodPatch.fatG = patch.fat_g
				if (isFiniteNumber(patch.carbs_g)) foodPatch.carbsG = patch.carbs_g
				if (isFiniteNumber(patch.fiber_g)) foodPatch.fiberG = patch.fiber_g
				if (isFiniteNumber(patch.protein_g))
					foodPatch.proteinG = patch.protein_g
				if (typeof patch.notes === 'string') foodPatch.notes = patch.notes
				if (typeof patch.raw_json === 'string' || patch.raw_json === null)
					foodPatch.rawJson = patch.raw_json as string | null
				const updated = await store.updateFood(user.userId, id, foodPatch)
				if (!updated) {
					return jsonResponse(
						{ ok: false, error: 'Food entry not found.' },
						{ status: 404 },
					)
				}
				return jsonResponse({ ok: true, entry: updated })
			}

			if (data.kind === 'ketone') {
				const ketonePatch: KetoneEntryPatch = {}
				const measuredAt = readIso(patch.measured_at)
				if (measuredAt !== undefined) ketonePatch.measuredAt = measuredAt
				if (isFiniteNumber(patch.value)) ketonePatch.value = patch.value
				if (isKetoneUnit(patch.unit)) ketonePatch.unit = patch.unit
				if (typeof patch.notes === 'string') ketonePatch.notes = patch.notes
				const updated = await store.updateKetone(user.userId, id, ketonePatch)
				if (!updated) {
					return jsonResponse(
						{ ok: false, error: 'Ketone entry not found.' },
						{ status: 404 },
					)
				}
				return jsonResponse({ ok: true, entry: updated })
			}

			const glucosePatch: GlucoseEntryPatch = {}
			const measuredAt = readIso(patch.measured_at)
			if (measuredAt !== undefined) glucosePatch.measuredAt = measuredAt
			if (isFiniteNumber(patch.value)) glucosePatch.value = patch.value
			if (isGlucoseUnit(patch.unit)) glucosePatch.unit = patch.unit
			if (typeof patch.notes === 'string') glucosePatch.notes = patch.notes
			const updated = await store.updateGlucose(user.userId, id, glucosePatch)
			if (!updated) {
				return jsonResponse(
					{ ok: false, error: 'Glucose entry not found.' },
					{ status: 404 },
				)
			}
			return jsonResponse({ ok: true, entry: updated })
		},
	} satisfies BuildAction<
		typeof routes.ketoEntriesUpdate.method,
		typeof routes.ketoEntriesUpdate.pattern
	>
}

export function createKetoEntriesDeleteHandler(appEnv: AppEnv) {
	const store = createKetoLogStore(appEnv.APP_DB)
	return {
		middleware: [],
		async handler({ request }) {
			const user = await readAuthenticatedAppUser(request, appEnv as Env)
			if (!user) {
				return jsonResponse(
					{ ok: false, error: 'Unauthorized' },
					{ status: 401 },
				)
			}
			let body: unknown
			try {
				body = await request.json()
			} catch {
				return jsonResponse(
					{ ok: false, error: 'Invalid JSON payload.' },
					{ status: 400 },
				)
			}
			if (!body || typeof body !== 'object') {
				return jsonResponse(
					{ ok: false, error: 'Body must be an object.' },
					{ status: 400 },
				)
			}
			const data = body as Record<string, unknown>
			if (!isEntryKind(data.kind) || !isFiniteNumber(data.id) || data.id <= 0) {
				return jsonResponse(
					{ ok: false, error: 'kind and id are required.' },
					{ status: 400 },
				)
			}
			const id = Math.floor(data.id)
			const deleted = await store.softDelete(user.userId, data.kind, id)
			if (!deleted) {
				return jsonResponse(
					{ ok: false, error: 'Entry not found.' },
					{ status: 404 },
				)
			}
			return jsonResponse({ ok: true })
		},
	} satisfies BuildAction<
		typeof routes.ketoEntriesDelete.method,
		typeof routes.ketoEntriesDelete.pattern
	>
}

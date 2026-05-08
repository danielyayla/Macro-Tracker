import {
	createDb,
	foodEntriesTable,
	glucoseReadingsTable,
	ketoneReadingsTable,
	userGoalsTable,
} from '#worker/db.ts'
import {
	computeNetCarbs,
	type AnyEntry,
	type DailyTotals,
	type EntryKind,
	type EntrySource,
	type FoodEntry,
	type GlucoseEntry,
	type GlucoseUnit,
	type Goals,
	type KetoneEntry,
	type KetoneUnit,
	type LogRange,
} from '#shared/keto-log.ts'

type FoodRow = {
	id: number
	user_id: number
	eaten_at: string
	name: string
	serving: string
	kcal: number
	fat_g: number
	carbs_g: number
	fiber_g: number
	protein_g: number
	notes: string
	raw_json: string | null
	source: string
	created_at: string
	updated_at: string
	deleted_at: string | null
}

type KetoneRow = {
	id: number
	user_id: number
	measured_at: string
	value: number
	unit: string
	notes: string
	source: string
	created_at: string
	updated_at: string
	deleted_at: string | null
}

type GlucoseRow = KetoneRow

type GoalsRow = {
	user_id: number
	daily_kcal: number | null
	daily_fat_g: number | null
	daily_net_carbs_g: number | null
	daily_protein_g: number | null
	ketone_target_min: number | null
	ketone_target_max: number | null
	updated_at: string | null
}

function toIsoNow() {
	return new Date().toISOString()
}

function toEntrySource(value: string): EntrySource {
	return value === 'web' ? 'web' : 'mcp'
}

function rowToFood(row: FoodRow): FoodEntry {
	return {
		id: row.id,
		kind: 'food',
		eatenAt: row.eaten_at,
		name: row.name,
		serving: row.serving,
		kcal: Number(row.kcal),
		fatG: Number(row.fat_g),
		carbsG: Number(row.carbs_g),
		fiberG: Number(row.fiber_g),
		proteinG: Number(row.protein_g),
		netCarbsG: computeNetCarbs(Number(row.carbs_g), Number(row.fiber_g)),
		notes: row.notes,
		rawJson: row.raw_json,
		source: toEntrySource(row.source),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

function rowToKetone(row: KetoneRow): KetoneEntry {
	return {
		id: row.id,
		kind: 'ketone',
		measuredAt: row.measured_at,
		value: Number(row.value),
		unit: row.unit as KetoneUnit,
		notes: row.notes,
		source: toEntrySource(row.source),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

function rowToGlucose(row: GlucoseRow): GlucoseEntry {
	return {
		id: row.id,
		kind: 'glucose',
		measuredAt: row.measured_at,
		value: Number(row.value),
		unit: row.unit as GlucoseUnit,
		notes: row.notes,
		source: toEntrySource(row.source),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

function rowToGoals(row: GoalsRow | null | undefined): Goals {
	return {
		dailyKcal: row?.daily_kcal ?? null,
		dailyFatG: row?.daily_fat_g ?? null,
		dailyNetCarbsG: row?.daily_net_carbs_g ?? null,
		dailyProteinG: row?.daily_protein_g ?? null,
		ketoneTargetMin: row?.ketone_target_min ?? null,
		ketoneTargetMax: row?.ketone_target_max ?? null,
		updatedAt: row?.updated_at ?? null,
	}
}

function entryTimestamp(entry: AnyEntry) {
	return entry.kind === 'food' ? entry.eatenAt : entry.measuredAt
}

function sumDailyTotals(entries: Array<AnyEntry>): DailyTotals {
	const totals: DailyTotals = {
		kcal: 0,
		fatG: 0,
		carbsG: 0,
		fiberG: 0,
		netCarbsG: 0,
		proteinG: 0,
	}
	for (const entry of entries) {
		if (entry.kind !== 'food') continue
		totals.kcal += entry.kcal
		totals.fatG += entry.fatG
		totals.carbsG += entry.carbsG
		totals.fiberG += entry.fiberG
		totals.netCarbsG += entry.netCarbsG
		totals.proteinG += entry.proteinG
	}
	return totals
}

export type FoodEntryInput = {
	name: string
	eatenAt?: string
	serving?: string
	kcal: number
	fatG: number
	carbsG: number
	fiberG?: number
	proteinG?: number
	notes?: string
	rawJson?: string | null
	source?: EntrySource
}

export type KetoneEntryInput = {
	value: number
	unit: KetoneUnit
	measuredAt?: string
	notes?: string
	source?: EntrySource
}

export type GlucoseEntryInput = {
	value: number
	unit: GlucoseUnit
	measuredAt?: string
	notes?: string
	source?: EntrySource
}

export type FoodEntryPatch = Partial<
	Omit<FoodEntryInput, 'rawJson' | 'source'> & {
		rawJson?: string | null
	}
>

export type KetoneEntryPatch = Partial<Omit<KetoneEntryInput, 'source'>>

export type GlucoseEntryPatch = Partial<Omit<GlucoseEntryInput, 'source'>>

export type GoalsPatch = Partial<{
	dailyKcal: number | null
	dailyFatG: number | null
	dailyNetCarbsG: number | null
	dailyProteinG: number | null
	ketoneTargetMin: number | null
	ketoneTargetMax: number | null
}>

export function createKetoLogStore(db: D1Database) {
	const database = createDb(db)

	async function readFood(userId: number, id: number) {
		return (await database.findOne(foodEntriesTable, {
			where: { id, user_id: userId, deleted_at: null },
		})) as FoodRow | null
	}

	async function readKetone(userId: number, id: number) {
		return (await database.findOne(ketoneReadingsTable, {
			where: { id, user_id: userId, deleted_at: null },
		})) as KetoneRow | null
	}

	async function readGlucose(userId: number, id: number) {
		return (await database.findOne(glucoseReadingsTable, {
			where: { id, user_id: userId, deleted_at: null },
		})) as GlucoseRow | null
	}

	return {
		async logFood(userId: number, input: FoodEntryInput): Promise<FoodEntry> {
			const created = (await database.create(
				foodEntriesTable,
				{
					user_id: userId,
					eaten_at: input.eatenAt ?? toIsoNow(),
					name: input.name,
					serving: input.serving ?? '',
					kcal: input.kcal,
					fat_g: input.fatG,
					carbs_g: input.carbsG,
					fiber_g: input.fiberG ?? 0,
					protein_g: input.proteinG ?? 0,
					notes: input.notes ?? '',
					raw_json: input.rawJson ?? null,
					source: input.source ?? 'mcp',
				},
				{ returnRow: true },
			)) as FoodRow
			return rowToFood(created)
		},
		async logKetone(
			userId: number,
			input: KetoneEntryInput,
		): Promise<KetoneEntry> {
			const created = (await database.create(
				ketoneReadingsTable,
				{
					user_id: userId,
					measured_at: input.measuredAt ?? toIsoNow(),
					value: input.value,
					unit: input.unit,
					notes: input.notes ?? '',
					source: input.source ?? 'mcp',
				},
				{ returnRow: true },
			)) as KetoneRow
			return rowToKetone(created)
		},
		async logGlucose(
			userId: number,
			input: GlucoseEntryInput,
		): Promise<GlucoseEntry> {
			const created = (await database.create(
				glucoseReadingsTable,
				{
					user_id: userId,
					measured_at: input.measuredAt ?? toIsoNow(),
					value: input.value,
					unit: input.unit,
					notes: input.notes ?? '',
					source: input.source ?? 'mcp',
				},
				{ returnRow: true },
			)) as GlucoseRow
			return rowToGlucose(created)
		},

		async updateFood(
			userId: number,
			id: number,
			patch: FoodEntryPatch,
		): Promise<FoodEntry | null> {
			const existing = await readFood(userId, id)
			if (!existing) return null
			const next: Record<string, unknown> = {}
			if (patch.eatenAt !== undefined) next.eaten_at = patch.eatenAt
			if (patch.name !== undefined) next.name = patch.name
			if (patch.serving !== undefined) next.serving = patch.serving
			if (patch.kcal !== undefined) next.kcal = patch.kcal
			if (patch.fatG !== undefined) next.fat_g = patch.fatG
			if (patch.carbsG !== undefined) next.carbs_g = patch.carbsG
			if (patch.fiberG !== undefined) next.fiber_g = patch.fiberG
			if (patch.proteinG !== undefined) next.protein_g = patch.proteinG
			if (patch.notes !== undefined) next.notes = patch.notes
			if (patch.rawJson !== undefined) next.raw_json = patch.rawJson
			const updated = (await database.update(foodEntriesTable, id, next, {
				touch: true,
			})) as FoodRow
			return rowToFood(updated)
		},
		async updateKetone(
			userId: number,
			id: number,
			patch: KetoneEntryPatch,
		): Promise<KetoneEntry | null> {
			const existing = await readKetone(userId, id)
			if (!existing) return null
			const next: Record<string, unknown> = {}
			if (patch.measuredAt !== undefined) next.measured_at = patch.measuredAt
			if (patch.value !== undefined) next.value = patch.value
			if (patch.unit !== undefined) next.unit = patch.unit
			if (patch.notes !== undefined) next.notes = patch.notes
			const updated = (await database.update(ketoneReadingsTable, id, next, {
				touch: true,
			})) as KetoneRow
			return rowToKetone(updated)
		},
		async updateGlucose(
			userId: number,
			id: number,
			patch: GlucoseEntryPatch,
		): Promise<GlucoseEntry | null> {
			const existing = await readGlucose(userId, id)
			if (!existing) return null
			const next: Record<string, unknown> = {}
			if (patch.measuredAt !== undefined) next.measured_at = patch.measuredAt
			if (patch.value !== undefined) next.value = patch.value
			if (patch.unit !== undefined) next.unit = patch.unit
			if (patch.notes !== undefined) next.notes = patch.notes
			const updated = (await database.update(glucoseReadingsTable, id, next, {
				touch: true,
			})) as GlucoseRow
			return rowToGlucose(updated)
		},

		async softDelete(
			userId: number,
			kind: EntryKind,
			id: number,
		): Promise<boolean> {
			const now = toIsoNow()
			if (kind === 'food') {
				const existing = await readFood(userId, id)
				if (!existing) return false
				await database.update(
					foodEntriesTable,
					id,
					{ deleted_at: now },
					{ touch: true },
				)
				return true
			}
			if (kind === 'ketone') {
				const existing = await readKetone(userId, id)
				if (!existing) return false
				await database.update(
					ketoneReadingsTable,
					id,
					{ deleted_at: now },
					{ touch: true },
				)
				return true
			}
			const existing = await readGlucose(userId, id)
			if (!existing) return false
			await database.update(
				glucoseReadingsTable,
				id,
				{ deleted_at: now },
				{ touch: true },
			)
			return true
		},

		async listRange(
			userId: number,
			options: {
				from: string
				to: string
				kinds?: ReadonlyArray<EntryKind>
			},
		): Promise<LogRange> {
			const kinds = options.kinds ?? (['food', 'ketone', 'glucose'] as const)
			const wantFood = kinds.includes('food')
			const wantKetone = kinds.includes('ketone')
			const wantGlucose = kinds.includes('glucose')

			const [foodRows, ketoneRows, glucoseRows, goalsRow] = await Promise.all([
				wantFood
					? db
							.prepare(
								`
									SELECT id, user_id, eaten_at, name, serving, kcal, fat_g,
										carbs_g, fiber_g, protein_g, notes, raw_json, source,
										created_at, updated_at, deleted_at
									FROM food_entries
									WHERE user_id = ?
										AND deleted_at IS NULL
										AND eaten_at >= ?
										AND eaten_at < ?
									ORDER BY eaten_at ASC
								`,
							)
							.bind(userId, options.from, options.to)
							.all<FoodRow>()
							.then((result) => result.results ?? [])
					: Promise.resolve<Array<FoodRow>>([]),
				wantKetone
					? db
							.prepare(
								`
									SELECT id, user_id, measured_at, value, unit, notes, source,
										created_at, updated_at, deleted_at
									FROM ketone_readings
									WHERE user_id = ?
										AND deleted_at IS NULL
										AND measured_at >= ?
										AND measured_at < ?
									ORDER BY measured_at ASC
								`,
							)
							.bind(userId, options.from, options.to)
							.all<KetoneRow>()
							.then((result) => result.results ?? [])
					: Promise.resolve<Array<KetoneRow>>([]),
				wantGlucose
					? db
							.prepare(
								`
									SELECT id, user_id, measured_at, value, unit, notes, source,
										created_at, updated_at, deleted_at
									FROM glucose_readings
									WHERE user_id = ?
										AND deleted_at IS NULL
										AND measured_at >= ?
										AND measured_at < ?
									ORDER BY measured_at ASC
								`,
							)
							.bind(userId, options.from, options.to)
							.all<GlucoseRow>()
							.then((result) => result.results ?? [])
					: Promise.resolve<Array<GlucoseRow>>([]),
				database.findOne(userGoalsTable, {
					where: { user_id: userId },
				}) as Promise<GoalsRow | null>,
			])

			const entries: Array<AnyEntry> = [
				...foodRows.map(rowToFood),
				...ketoneRows.map(rowToKetone),
				...glucoseRows.map(rowToGlucose),
			].sort((a, b) => entryTimestamp(a).localeCompare(entryTimestamp(b)))

			return {
				from: options.from,
				to: options.to,
				entries,
				totals: sumDailyTotals(entries),
				goals: rowToGoals(goalsRow),
			}
		},

		async getGoals(userId: number): Promise<Goals> {
			const row = (await database.findOne(userGoalsTable, {
				where: { user_id: userId },
			})) as GoalsRow | null
			return rowToGoals(row)
		},

		async setGoals(userId: number, patch: GoalsPatch): Promise<Goals> {
			const existing = (await database.findOne(userGoalsTable, {
				where: { user_id: userId },
			})) as GoalsRow | null

			const next: Record<string, unknown> = {
				user_id: userId,
				daily_kcal: existing?.daily_kcal ?? null,
				daily_fat_g: existing?.daily_fat_g ?? null,
				daily_net_carbs_g: existing?.daily_net_carbs_g ?? null,
				daily_protein_g: existing?.daily_protein_g ?? null,
				ketone_target_min: existing?.ketone_target_min ?? null,
				ketone_target_max: existing?.ketone_target_max ?? null,
			}
			if (patch.dailyKcal !== undefined) next.daily_kcal = patch.dailyKcal
			if (patch.dailyFatG !== undefined) next.daily_fat_g = patch.dailyFatG
			if (patch.dailyNetCarbsG !== undefined)
				next.daily_net_carbs_g = patch.dailyNetCarbsG
			if (patch.dailyProteinG !== undefined)
				next.daily_protein_g = patch.dailyProteinG
			if (patch.ketoneTargetMin !== undefined)
				next.ketone_target_min = patch.ketoneTargetMin
			if (patch.ketoneTargetMax !== undefined)
				next.ketone_target_max = patch.ketoneTargetMax

			if (existing) {
				const updated = (await database.update(userGoalsTable, userId, next, {
					touch: true,
				})) as GoalsRow
				return rowToGoals(updated)
			}
			const created = (await database.create(userGoalsTable, next, {
				returnRow: true,
			})) as GoalsRow
			return rowToGoals(created)
		},
	}
}

export type KetoLogStore = ReturnType<typeof createKetoLogStore>

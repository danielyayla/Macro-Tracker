export const ketoneUnits = [
	'mmol_L_blood',
	'ppm_breath',
	'mg_dL_urine',
] as const
export type KetoneUnit = (typeof ketoneUnits)[number]

export const glucoseUnits = ['mg_dL', 'mmol_L'] as const
export type GlucoseUnit = (typeof glucoseUnits)[number]

export const entryKinds = ['food', 'ketone', 'glucose'] as const
export type EntryKind = (typeof entryKinds)[number]

export const entrySources = ['mcp', 'web'] as const
export type EntrySource = (typeof entrySources)[number]

export type FoodEntry = {
	id: number
	kind: 'food'
	eatenAt: string
	name: string
	serving: string
	kcal: number
	fatG: number
	carbsG: number
	fiberG: number
	proteinG: number
	netCarbsG: number
	notes: string
	rawJson: string | null
	source: EntrySource
	createdAt: string
	updatedAt: string
}

export type KetoneEntry = {
	id: number
	kind: 'ketone'
	measuredAt: string
	value: number
	unit: KetoneUnit
	notes: string
	source: EntrySource
	createdAt: string
	updatedAt: string
}

export type GlucoseEntry = {
	id: number
	kind: 'glucose'
	measuredAt: string
	value: number
	unit: GlucoseUnit
	notes: string
	source: EntrySource
	createdAt: string
	updatedAt: string
}

export type AnyEntry = FoodEntry | KetoneEntry | GlucoseEntry

export type DailyTotals = {
	kcal: number
	fatG: number
	carbsG: number
	fiberG: number
	netCarbsG: number
	proteinG: number
}

export type Goals = {
	dailyKcal: number | null
	dailyFatG: number | null
	dailyNetCarbsG: number | null
	dailyProteinG: number | null
	ketoneTargetMin: number | null
	ketoneTargetMax: number | null
	updatedAt: string | null
}

export type LogRange = {
	from: string
	to: string
	entries: Array<AnyEntry>
	totals: DailyTotals
	goals: Goals
}

const MG_DL_PER_MMOL_GLUCOSE = 18

export function computeNetCarbs(carbsG: number, fiberG: number) {
	return Math.max(0, carbsG - fiberG)
}

export function glucoseToMgDl(value: number, unit: GlucoseUnit) {
	return unit === 'mg_dL' ? value : value * MG_DL_PER_MMOL_GLUCOSE
}

export function ketoneToMmolBlood(value: number, unit: KetoneUnit) {
	return unit === 'mmol_L_blood' ? value : null
}

export function computeGki(
	glucose: { value: number; unit: GlucoseUnit },
	ketones: { value: number; unit: KetoneUnit },
) {
	const ketonesMmolBlood = ketoneToMmolBlood(ketones.value, ketones.unit)
	if (ketonesMmolBlood === null || ketonesMmolBlood <= 0) return null
	const glucoseMgDl = glucoseToMgDl(glucose.value, glucose.unit)
	return glucoseMgDl / MG_DL_PER_MMOL_GLUCOSE / ketonesMmolBlood
}

export function isKetoneUnit(value: unknown): value is KetoneUnit {
	return typeof value === 'string' && ketoneUnits.includes(value as KetoneUnit)
}

export function isGlucoseUnit(value: unknown): value is GlucoseUnit {
	return (
		typeof value === 'string' && glucoseUnits.includes(value as GlucoseUnit)
	)
}

export function isEntryKind(value: unknown): value is EntryKind {
	return typeof value === 'string' && entryKinds.includes(value as EntryKind)
}

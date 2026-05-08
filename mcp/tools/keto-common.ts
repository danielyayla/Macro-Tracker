import { type MCP } from '#mcp/index.ts'
import { createKetoLogStore, type KetoLogStore } from '#server/keto-log.ts'

export type ResolvedToolContext = {
	userId: number
	userEmail: string
	store: KetoLogStore
}

export function resolveToolContext(agent: MCP): ResolvedToolContext | null {
	const { user } = agent.getCallerContext()
	if (!user) return null
	const userId = Number.parseInt(user.userId, 10)
	if (!Number.isFinite(userId)) return null
	const env = (agent as unknown as { env: Env }).env
	const db = env.APP_DB
	if (!db) return null
	return {
		userId,
		userEmail: user.email,
		store: createKetoLogStore(db),
	}
}

export function unauthenticatedResult() {
	return {
		content: [
			{
				type: 'text' as const,
				text: `
❌ Not signed in.

Connect this MCP server with an account so the tool can read and write your keto log.
				`.trim(),
			},
		],
		structuredContent: { error: 'NOT_AUTHENTICATED' as const },
		isError: true as const,
	}
}

export function notFoundResult(kind: string, id: number) {
	return {
		content: [
			{
				type: 'text' as const,
				text: `❌ No ${kind} entry with id ${id} found in your log.`,
			},
		],
		structuredContent: { error: 'NOT_FOUND' as const, kind, id },
		isError: true as const,
	}
}

export function isoOrNow(value: string | undefined) {
	if (!value) return new Date().toISOString()
	const trimmed = value.trim()
	if (!trimmed) return new Date().toISOString()
	const parsed = new Date(trimmed)
	if (Number.isNaN(parsed.getTime())) {
		throw new Error(`Invalid ISO 8601 timestamp: "${value}"`)
	}
	return parsed.toISOString()
}

export function startOfTodayIso(now = new Date()) {
	const start = new Date(now)
	start.setHours(0, 0, 0, 0)
	return start.toISOString()
}

export function endOfTodayIso(now = new Date()) {
	const end = new Date(now)
	end.setHours(0, 0, 0, 0)
	end.setDate(end.getDate() + 1)
	return end.toISOString()
}

export function formatNumber(value: number, fractionDigits = 1) {
	if (!Number.isFinite(value)) return '—'
	if (Number.isInteger(value)) return String(value)
	return value.toFixed(fractionDigits).replace(/\.?0+$/, '')
}

export function describeKetoneUnit(unit: string) {
	if (unit === 'mmol_L_blood') return 'mmol/L (blood)'
	if (unit === 'ppm_breath') return 'ppm (breath)'
	if (unit === 'mg_dL_urine') return 'mg/dL (urine)'
	return unit
}

export function describeGlucoseUnit(unit: string) {
	if (unit === 'mg_dL') return 'mg/dL'
	if (unit === 'mmol_L') return 'mmol/L'
	return unit
}

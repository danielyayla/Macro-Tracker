import { type BuildAction } from 'remix/fetch-router'
import { readAuthenticatedAppUser } from '#server/authenticated-user.ts'
import { createKetoLogStore } from '#server/keto-log.ts'
import { type routes } from '#server/routes.ts'
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

function readGoalNumber(value: unknown): number | null | undefined {
	if (value === undefined) return undefined
	if (value === null) return null
	if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
		return value
	}
	return undefined
}

export function createKetoGoalsHandler(appEnv: AppEnv) {
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
				const goals = await store.getGoals(user.userId)
				return jsonResponse({ ok: true, goals })
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
			const goals = await store.setGoals(user.userId, {
				dailyKcal: readGoalNumber(data.daily_kcal),
				dailyFatG: readGoalNumber(data.daily_fat_g),
				dailyNetCarbsG: readGoalNumber(data.daily_net_carbs_g),
				dailyProteinG: readGoalNumber(data.daily_protein_g),
				ketoneTargetMin: readGoalNumber(data.ketone_target_min),
				ketoneTargetMax: readGoalNumber(data.ketone_target_max),
			})
			return jsonResponse({ ok: true, goals })
		},
	} satisfies BuildAction<
		typeof routes.ketoGoalsUpdate.method | typeof routes.ketoGoals.method,
		typeof routes.ketoGoals.pattern
	>
}

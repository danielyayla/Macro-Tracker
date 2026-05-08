import { css, on, type Handle } from 'remix/ui'
import { colors, radius, spacing, typography } from '#client/styles/tokens.ts'
import { type Goals } from '#shared/keto-log.ts'

type AccountStatus = 'idle' | 'loading' | 'ready' | 'error'

type GoalField =
	| 'dailyKcal'
	| 'dailyFatG'
	| 'dailyNetCarbsG'
	| 'dailyProteinG'
	| 'ketoneTargetMin'
	| 'ketoneTargetMax'

const goalFieldLabels: Record<GoalField, string> = {
	dailyKcal: 'Daily calories (kcal)',
	dailyFatG: 'Daily fat (g)',
	dailyNetCarbsG: 'Daily net carbs (g)',
	dailyProteinG: 'Daily protein (g)',
	ketoneTargetMin: 'Ketone target min (mmol/L blood)',
	ketoneTargetMax: 'Ketone target max (mmol/L blood)',
}

const goalFieldApiKey: Record<GoalField, string> = {
	dailyKcal: 'daily_kcal',
	dailyFatG: 'daily_fat_g',
	dailyNetCarbsG: 'daily_net_carbs_g',
	dailyProteinG: 'daily_protein_g',
	ketoneTargetMin: 'ketone_target_min',
	ketoneTargetMax: 'ketone_target_max',
}

function emptyGoals(): Goals {
	return {
		dailyKcal: null,
		dailyFatG: null,
		dailyNetCarbsG: null,
		dailyProteinG: null,
		ketoneTargetMin: null,
		ketoneTargetMax: null,
		updatedAt: null,
	}
}

function toFormString(value: number | null) {
	return value === null ? '' : String(value)
}

function parseGoalInput(value: string): number | null | undefined {
	const trimmed = value.trim()
	if (!trimmed) return null
	const parsed = Number(trimmed)
	if (!Number.isFinite(parsed) || parsed < 0) return undefined
	return parsed
}

export function AccountRoute(handle: Handle) {
	let status: AccountStatus = 'loading'
	let email = ''
	let message: string | null = null
	let goals: Goals = emptyGoals()
	let goalDrafts: Record<GoalField, string> = {
		dailyKcal: '',
		dailyFatG: '',
		dailyNetCarbsG: '',
		dailyProteinG: '',
		ketoneTargetMin: '',
		ketoneTargetMax: '',
	}
	let goalsSaving = false
	let goalsMessage: string | null = null
	let goalsError: string | null = null

	function applyGoals(next: Goals) {
		goals = next
		goalDrafts = {
			dailyKcal: toFormString(next.dailyKcal),
			dailyFatG: toFormString(next.dailyFatG),
			dailyNetCarbsG: toFormString(next.dailyNetCarbsG),
			dailyProteinG: toFormString(next.dailyProteinG),
			ketoneTargetMin: toFormString(next.ketoneTargetMin),
			ketoneTargetMax: toFormString(next.ketoneTargetMax),
		}
	}

	async function loadAccount(signal: AbortSignal) {
		try {
			const [sessionResponse, goalsResponse] = await Promise.all([
				fetch('/session', {
					headers: { Accept: 'application/json' },
					credentials: 'include',
					signal,
				}),
				fetch('/keto-goals', {
					headers: { Accept: 'application/json' },
					credentials: 'include',
					signal,
				}),
			])
			if (signal.aborted) return
			const sessionPayload = await sessionResponse.json().catch(() => null)
			const sessionEmail =
				sessionResponse.ok &&
				sessionPayload?.ok &&
				typeof sessionPayload?.session?.email === 'string'
					? sessionPayload.session.email.trim()
					: ''
			if (!sessionEmail) {
				window.location.assign('/login')
				return
			}
			email = sessionEmail
			if (goalsResponse.ok) {
				const goalsPayload = (await goalsResponse.json()) as {
					ok: true
					goals: Goals
				}
				applyGoals(goalsPayload.goals)
			}
			status = 'ready'
			message = null
			handle.update()
		} catch {
			if (signal.aborted) return
			status = 'error'
			message = 'Unable to load your account.'
			handle.update()
		}
	}

	function setDraft(field: GoalField, value: string) {
		goalDrafts = { ...goalDrafts, [field]: value }
		goalsMessage = null
		goalsError = null
		handle.update()
	}

	function buildPatch(): Record<string, number | null> | null {
		const patch: Record<string, number | null> = {}
		for (const field of Object.keys(goalFieldApiKey) as Array<GoalField>) {
			const draft = goalDrafts[field]
			const parsed = parseGoalInput(draft)
			if (parsed === undefined) {
				goalsError = `${goalFieldLabels[field]}: enter a non-negative number or leave blank.`
				return null
			}
			patch[goalFieldApiKey[field]] = parsed
		}
		return patch
	}

	function saveGoals() {
		if (goalsSaving) return
		const patch = buildPatch()
		if (!patch) {
			handle.update()
			return
		}
		goalsSaving = true
		goalsMessage = null
		goalsError = null
		handle.update()
		handle.queueTask(async (signal) => {
			try {
				const response = await fetch('/keto-goals', {
					method: 'POST',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(patch),
					signal,
				})
				goalsSaving = false
				if (signal.aborted) return
				if (!response.ok) {
					goalsError = 'Could not save goals.'
					handle.update()
					return
				}
				const payload = (await response.json()) as { ok: true; goals: Goals }
				applyGoals(payload.goals)
				goalsMessage = 'Saved.'
				handle.update()
			} catch {
				goalsSaving = false
				if (signal.aborted) return
				goalsError = 'Could not save goals.'
				handle.update()
			}
		})
	}

	const inputCss = css({
		padding: `${spacing.xs} ${spacing.sm}`,
		borderRadius: radius.md,
		border: `1px solid ${colors.border}`,
		fontSize: typography.fontSize.base,
		fontFamily: typography.fontFamily,
		color: colors.text,
		backgroundColor: colors.surface,
		width: '100%',
	})

	const labelCss = css({
		display: 'grid',
		gap: spacing.xs,
		fontSize: typography.fontSize.sm,
		color: colors.textMuted,
	})

	function renderField(field: GoalField) {
		const inputId = `goal-${field}`
		return (
			<label key={field} htmlFor={inputId} mix={[labelCss]}>
				<span>{goalFieldLabels[field]}</span>
				<input
					id={inputId}
					type="number"
					min="0"
					step="any"
					value={goalDrafts[field]}
					placeholder="—"
					mix={[
						inputCss,
						on('input', (event) => {
							const target = event.target
							if (target instanceof HTMLInputElement) {
								setDraft(field, target.value)
							}
						}),
					]}
				/>
			</label>
		)
	}

	return () => {
		if (status === 'loading') {
			handle.queueTask(loadAccount)
		}
		return (
			<section
				mix={[
					css({
						maxWidth: '36rem',
						margin: '0 auto',
						display: 'grid',
						gap: spacing.lg,
					}),
				]}
			>
				<header mix={[css({ display: 'grid', gap: spacing.xs })]}>
					<h1
						mix={[
							css({
								fontSize: typography.fontSize.xl,
								fontWeight: typography.fontWeight.semibold,
								color: colors.text,
								margin: 0,
							}),
						]}
					>
						{email ? `Welcome, ${email}` : 'Welcome'}
					</h1>
					<p mix={[css({ color: colors.textMuted, margin: 0 })]}>
						You are signed in to macro-tracker.
					</p>
				</header>

				{status === 'loading' ? (
					<p mix={[css({ color: colors.textMuted })]}>Loading your account…</p>
				) : null}

				{message ? (
					<p role="alert" mix={[css({ color: colors.error })]}>
						{message}
					</p>
				) : null}

				{status === 'ready' ? (
					<section
						mix={[
							css({
								display: 'grid',
								gap: spacing.md,
								padding: spacing.lg,
								border: `1px solid ${colors.border}`,
								borderRadius: radius.lg,
								backgroundColor: colors.surface,
							}),
						]}
					>
						<header mix={[css({ display: 'grid', gap: spacing.xs })]}>
							<h2
								mix={[
									css({
										fontSize: typography.fontSize.lg,
										fontWeight: typography.fontWeight.semibold,
										color: colors.text,
										margin: 0,
									}),
								]}
							>
								Daily goals
							</h2>
							<p mix={[css({ color: colors.textMuted, margin: 0 })]}>
								Leave a field blank to clear that goal. Net carbs = total carbs
								− fiber.
							</p>
						</header>
						<div
							mix={[
								css({
									display: 'grid',
									gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
									gap: spacing.sm,
								}),
							]}
						>
							{(
								[
									'dailyKcal',
									'dailyFatG',
									'dailyNetCarbsG',
									'dailyProteinG',
									'ketoneTargetMin',
									'ketoneTargetMax',
								] as Array<GoalField>
							).map(renderField)}
						</div>
						<div
							mix={[
								css({
									display: 'flex',
									gap: spacing.sm,
									alignItems: 'center',
									flexWrap: 'wrap',
								}),
							]}
						>
							<button
								type="button"
								disabled={goalsSaving}
								mix={[
									css({
										padding: `${spacing.xs} ${spacing.lg}`,
										borderRadius: radius.full,
										border: 'none',
										backgroundColor: colors.primary,
										color: colors.onPrimary,
										fontWeight: typography.fontWeight.semibold,
										cursor: 'pointer',
										'&:disabled': {
											opacity: 0.6,
											cursor: 'not-allowed',
										},
									}),
									on('click', saveGoals),
								]}
							>
								{goalsSaving ? 'Saving…' : 'Save goals'}
							</button>
							{goalsMessage ? (
								<span mix={[css({ color: colors.textMuted })]}>
									{goalsMessage}
								</span>
							) : null}
							{goalsError ? (
								<span role="alert" mix={[css({ color: colors.error })]}>
									{goalsError}
								</span>
							) : null}
							{goals.updatedAt ? (
								<span
									mix={[
										css({
											marginLeft: 'auto',
											fontSize: typography.fontSize.sm,
											color: colors.textMuted,
										}),
									]}
								>
									Last saved {new Date(goals.updatedAt).toLocaleString()}
								</span>
							) : null}
						</div>
					</section>
				) : null}
			</section>
		)
	}
}

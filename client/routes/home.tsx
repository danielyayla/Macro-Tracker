import { css, on, type Handle } from 'remix/ui'
import {
	colors,
	radius,
	shadows,
	spacing,
	typography,
} from '#client/styles/tokens.ts'
import {
	type AnyEntry,
	type DailyTotals,
	type EntryKind,
	type GlucoseEntry,
	type Goals,
	type KetoneEntry,
} from '#shared/keto-log.ts'

type LogStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unauthenticated'

type LogPayload = {
	ok: true
	from: string
	to: string
	entries: Array<AnyEntry>
	totals: DailyTotals
	goals: Goals
	latestGki: { gki: number; glucoseId: number; ketoneId: number } | null
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

function formatNumber(value: number, fractionDigits = 1) {
	if (!Number.isFinite(value)) return '—'
	if (Number.isInteger(value)) return String(value)
	return value.toFixed(fractionDigits).replace(/\.?0+$/, '')
}

function formatTime(iso: string) {
	const date = new Date(iso)
	if (Number.isNaN(date.getTime())) return iso
	return date.toLocaleTimeString(undefined, {
		hour: 'numeric',
		minute: '2-digit',
	})
}

function describeKetoneUnit(unit: KetoneEntry['unit']) {
	if (unit === 'mmol_L_blood') return 'mmol/L blood'
	if (unit === 'ppm_breath') return 'ppm breath'
	return 'mg/dL urine'
}

function describeGlucoseUnit(unit: GlucoseEntry['unit']) {
	return unit === 'mg_dL' ? 'mg/dL' : 'mmol/L'
}

function entryAt(entry: AnyEntry) {
	return entry.kind === 'food' ? entry.eatenAt : entry.measuredAt
}

function entryIcon(entry: AnyEntry) {
	if (entry.kind === 'food') return '🍽️'
	if (entry.kind === 'ketone') return '🩸'
	return '📊'
}

function entryLabel(entry: AnyEntry) {
	if (entry.kind === 'food') {
		return entry.serving ? `${entry.name} · ${entry.serving}` : entry.name
	}
	if (entry.kind === 'ketone') {
		return `Ketones ${formatNumber(entry.value, 2)} ${describeKetoneUnit(entry.unit)}`
	}
	return `Glucose ${formatNumber(entry.value, 1)} ${describeGlucoseUnit(entry.unit)}`
}

function entryMeta(entry: AnyEntry) {
	if (entry.kind !== 'food') return entry.notes
	return `${formatNumber(entry.kcal)} kcal · ${formatNumber(entry.netCarbsG)} g net · ${formatNumber(entry.fatG)} g fat · ${formatNumber(entry.proteinG)} g protein`
}

async function deleteEntry(kind: EntryKind, id: number, signal: AbortSignal) {
	const response = await fetch('/keto-entries/delete', {
		method: 'POST',
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ kind, id }),
		signal,
	})
	return response.ok
}

const cardCss = css({
	borderRadius: radius.md,
	border: `1px solid ${colors.border}`,
	padding: spacing.sm,
	display: 'grid',
	gap: '2px',
	backgroundColor: colors.surface,
})

const statLabelCss = css({
	fontSize: typography.fontSize.sm,
	color: colors.textMuted,
})

const refreshButtonCss = css({
	border: `1px solid ${colors.border}`,
	backgroundColor: 'transparent',
	color: colors.text,
	padding: `${spacing.xs} ${spacing.md}`,
	borderRadius: radius.full,
	cursor: 'pointer',
})

const deleteButtonCss = css({
	border: `1px solid ${colors.border}`,
	backgroundColor: 'transparent',
	color: colors.textMuted,
	padding: `${spacing.xs} ${spacing.sm}`,
	borderRadius: radius.full,
	cursor: 'pointer',
	'&:hover': {
		color: colors.danger,
	},
})

const entryRowCss = css({
	display: 'grid',
	gridTemplateColumns: 'auto 1fr auto',
	gap: spacing.sm,
	alignItems: 'center',
	padding: `${spacing.xs} ${spacing.sm}`,
	borderRadius: radius.md,
	border: `1px solid ${colors.border}`,
	backgroundColor: colors.surface,
})

export function HomeRoute(handle: Handle) {
	let status: LogStatus = 'idle'
	let log: LogPayload | null = null
	let errorMessage: string | null = null

	async function loadLog(signal: AbortSignal) {
		status = 'loading'
		const url = new URL('/keto-entries', window.location.href)
		url.searchParams.set('from', startOfTodayIso())
		url.searchParams.set('to', endOfTodayIso())
		try {
			const response = await fetch(url.toString(), {
				credentials: 'include',
				headers: { Accept: 'application/json' },
				signal,
			})
			if (signal.aborted) return
			if (response.status === 401) {
				status = 'unauthenticated'
				log = null
				errorMessage = null
				handle.update()
				return
			}
			if (!response.ok) {
				status = 'error'
				errorMessage = 'Could not load your log.'
				handle.update()
				return
			}
			const payload = (await response.json()) as LogPayload
			log = payload
			status = 'ready'
			errorMessage = null
			handle.update()
		} catch {
			if (signal.aborted) return
			status = 'error'
			errorMessage = 'Could not load your log.'
			handle.update()
		}
	}

	function reload() {
		handle.queueTask(loadLog)
	}

	function onDelete(kind: EntryKind, id: number) {
		const confirmed =
			typeof window === 'undefined' || window.confirm('Delete this entry?')
		if (!confirmed) return
		handle.queueTask(async (signal) => {
			const ok = await deleteEntry(kind, id, signal)
			if (!ok || signal.aborted) return
			await loadLog(signal)
		})
	}

	function renderTotals(totals: DailyTotals, goals: Goals) {
		const stats: Array<{
			label: string
			value: number
			target: number | null
		}> = [
			{ label: 'kcal', value: totals.kcal, target: goals.dailyKcal },
			{ label: 'fat (g)', value: totals.fatG, target: goals.dailyFatG },
			{
				label: 'net carbs (g)',
				value: totals.netCarbsG,
				target: goals.dailyNetCarbsG,
			},
			{
				label: 'protein (g)',
				value: totals.proteinG,
				target: goals.dailyProteinG,
			},
		]
		return (
			<div
				mix={[
					css({
						display: 'grid',
						gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
						gap: spacing.sm,
					}),
				]}
			>
				{stats.map((stat) => {
					const over = stat.target !== null && stat.value > stat.target
					return (
						<div key={stat.label} mix={[cardCss]}>
							<span mix={[statLabelCss]}>{stat.label}</span>
							<span
								mix={[
									css({
										fontWeight: typography.fontWeight.semibold,
										color: over ? colors.error : colors.text,
										fontVariantNumeric: 'tabular-nums',
									}),
								]}
							>
								{formatNumber(stat.value)}
							</span>
							{stat.target !== null ? (
								<span mix={[statLabelCss]}>of {formatNumber(stat.target)}</span>
							) : null}
						</div>
					)
				})}
			</div>
		)
	}

	function renderEntry(entry: AnyEntry) {
		const meta = entryMeta(entry)
		return (
			<li key={`${entry.kind}-${entry.id}`} mix={[entryRowCss]}>
				<span
					mix={[
						css({
							fontVariantNumeric: 'tabular-nums',
							color: colors.textMuted,
						}),
					]}
				>
					{entryIcon(entry)} {formatTime(entryAt(entry))}
				</span>
				<div mix={[css({ display: 'grid', gap: '2px' })]}>
					<span mix={[css({ color: colors.text })]}>{entryLabel(entry)}</span>
					{meta ? <span mix={[statLabelCss]}>{meta}</span> : null}
				</div>
				<button
					type="button"
					aria-label={`Delete ${entry.kind} entry`}
					mix={[
						deleteButtonCss,
						on('click', () => onDelete(entry.kind, entry.id)),
					]}
				>
					Delete
				</button>
			</li>
		)
	}

	return () => {
		if (status === 'idle') {
			handle.queueTask(loadLog)
		}

		return (
			<section mix={[css({ display: 'grid', gap: spacing.lg })]}>
				<header mix={[css({ display: 'grid', gap: spacing.xs })]}>
					<h1
						mix={[
							css({
								margin: 0,
								fontSize: typography.fontSize['2xl'],
								fontWeight: typography.fontWeight.semibold,
								color: colors.text,
							}),
						]}
					>
						Today's keto log
					</h1>
					<p mix={[css({ margin: 0, color: colors.textMuted })]}>
						{status === 'unauthenticated'
							? 'Sign in to start tracking food, ketones, and glucose.'
							: 'Food, ketone, and glucose readings for today.'}
					</p>
				</header>

				{status === 'unauthenticated' ? (
					<div
						mix={[
							css({
								display: 'grid',
								gap: spacing.md,
								padding: spacing.lg,
								borderRadius: radius.lg,
								border: `1px solid ${colors.border}`,
								background: `linear-gradient(135deg, ${colors.primarySoftStrong}, ${colors.primarySoftest})`,
								boxShadow: shadows.sm,
							}),
						]}
					>
						<p mix={[css({ margin: 0, color: colors.text })]}>
							Use Claude (mobile or desktop) to take a photo of your food. Your
							analyzed macros are saved here automatically. Track ketones and
							blood sugar from your meter.
						</p>
						<div mix={[css({ display: 'flex', gap: spacing.sm })]}>
							<a
								href="/login"
								mix={[
									css({
										color: colors.onPrimary,
										backgroundColor: colors.primary,
										padding: `${spacing.xs} ${spacing.md}`,
										borderRadius: radius.full,
										textDecoration: 'none',
										fontWeight: typography.fontWeight.medium,
									}),
								]}
							>
								Log in
							</a>
							<a
								href="/signup"
								mix={[
									css({
										color: colors.text,
										border: `1px solid ${colors.border}`,
										padding: `${spacing.xs} ${spacing.md}`,
										borderRadius: radius.full,
										textDecoration: 'none',
										fontWeight: typography.fontWeight.medium,
									}),
								]}
							>
								Sign up
							</a>
						</div>
					</div>
				) : null}

				{status === 'loading' ? (
					<p mix={[css({ color: colors.textMuted })]}>Loading…</p>
				) : null}

				{status === 'error' ? (
					<p role="alert" mix={[css({ color: colors.error })]}>
						{errorMessage}
					</p>
				) : null}

				{status === 'ready' && log ? renderTotals(log.totals, log.goals) : null}

				{status === 'ready' && log ? (
					<div
						mix={[
							css({
								display: 'flex',
								gap: spacing.sm,
								alignItems: 'center',
								justifyContent: 'space-between',
							}),
						]}
					>
						<span mix={[css({ color: colors.textMuted })]}>
							{log.latestGki
								? `Latest GKI: ${formatNumber(log.latestGki.gki, 2)}`
								: 'GKI: log a glucose + blood ketone reading'}
						</span>
						<button type="button" mix={[refreshButtonCss, on('click', reload)]}>
							Refresh
						</button>
					</div>
				) : null}

				{status === 'ready' && log ? (
					log.entries.length === 0 ? (
						<p
							mix={[
								css({
									padding: spacing.lg,
									textAlign: 'center',
									color: colors.textMuted,
									border: `1px dashed ${colors.border}`,
									borderRadius: radius.md,
								}),
							]}
						>
							No entries yet today. Log a meal from Claude to get started.
						</p>
					) : (
						<ul
							mix={[
								css({
									listStyle: 'none',
									margin: 0,
									padding: 0,
									display: 'grid',
									gap: spacing.xs,
								}),
							]}
						>
							{log.entries.map(renderEntry)}
						</ul>
					)
				) : null}
			</section>
		)
	}
}

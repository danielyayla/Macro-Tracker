import { createWidgetHostBridge } from './widget-host-bridge.js'

type FoodEntryPayload = {
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
}

type KetoneEntryPayload = {
	id: number
	kind: 'ketone'
	measuredAt: string
	value: number
	unit: 'mmol_L_blood' | 'ppm_breath' | 'mg_dL_urine'
	notes: string
}

type GlucoseEntryPayload = {
	id: number
	kind: 'glucose'
	measuredAt: string
	value: number
	unit: 'mg_dL' | 'mmol_L'
	notes: string
}

type EntryPayload = FoodEntryPayload | KetoneEntryPayload | GlucoseEntryPayload

type Goals = {
	dailyKcal: number | null
	dailyFatG: number | null
	dailyNetCarbsG: number | null
	dailyProteinG: number | null
	ketoneTargetMin: number | null
	ketoneTargetMax: number | null
}

type Totals = {
	kcal: number
	fatG: number
	carbsG: number
	fiberG: number
	netCarbsG: number
	proteinG: number
}

type ApiResponse = {
	ok: true
	from: string
	to: string
	totals: Totals
	goals: Goals
	entries: Array<EntryPayload>
	latestGki: { gki: number; glucoseId: number; ketoneId: number } | null
}

function readTheme(source: Record<string, unknown> | undefined) {
	const theme = source?.theme
	return theme === 'dark' || theme === 'light' ? theme : undefined
}

function formatNumber(value: number, fractionDigits = 1) {
	if (!Number.isFinite(value)) return '—'
	if (Number.isInteger(value)) return String(value)
	return value.toFixed(fractionDigits).replace(/\.?0+$/, '')
}

function formatTimestamp(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value
	return date.toLocaleTimeString(undefined, {
		hour: 'numeric',
		minute: '2-digit',
	})
}

function describeKetoneUnit(unit: KetoneEntryPayload['unit']) {
	if (unit === 'mmol_L_blood') return 'mmol/L blood'
	if (unit === 'ppm_breath') return 'ppm breath'
	return 'mg/dL urine'
}

function describeGlucoseUnit(unit: GlucoseEntryPayload['unit']) {
	return unit === 'mg_dL' ? 'mg/dL' : 'mmol/L'
}

function summarizeEntry(entry: EntryPayload) {
	if (entry.kind === 'food') {
		return {
			icon: '🍽️',
			label: entry.name + (entry.serving ? ` · ${entry.serving}` : ''),
			meta: `${formatNumber(entry.kcal)} kcal · ${formatNumber(entry.netCarbsG)} g net · ${formatNumber(entry.fatG)} g fat · ${formatNumber(entry.proteinG)} g protein`,
			at: entry.eatenAt,
		}
	}
	if (entry.kind === 'ketone') {
		return {
			icon: '🩸',
			label: `Ketones ${formatNumber(entry.value, 2)}`,
			meta: describeKetoneUnit(entry.unit),
			at: entry.measuredAt,
		}
	}
	return {
		icon: '📊',
		label: `Glucose ${formatNumber(entry.value, 1)}`,
		meta: describeGlucoseUnit(entry.unit),
		at: entry.measuredAt,
	}
}

function setStat(
	root: Element,
	key: string,
	value: number,
	target: number | null,
) {
	const stat = root.querySelector<HTMLElement>(`[data-stat="${key}"]`)
	if (!stat) return
	const valueElement = stat.querySelector<HTMLElement>('[data-stat-value]')
	const progressElement = stat.querySelector<HTMLElement>(
		'[data-stat-progress]',
	)
	if (valueElement) valueElement.textContent = formatNumber(value)
	if (progressElement) {
		progressElement.textContent = target ? `of ${formatNumber(target)}` : ''
	}
	if (target && value > target) {
		stat.classList.add('over')
	} else {
		stat.classList.remove('over')
	}
}

function initializeKetoLogWidget() {
	const documentRef = globalThis.document
	const windowRef = globalThis.window
	if (!documentRef || !windowRef) return

	const rootElement =
		documentRef.querySelector<HTMLElement>('[data-keto-log-ui]') ??
		documentRef.documentElement
	const apiUrl =
		documentRef
			.querySelector<HTMLElement>('[data-keto-log-ui]')
			?.getAttribute('data-api') ?? '/keto-entries'
	const themeRoot = documentRef.documentElement
	const rangeElement = documentRef.querySelector<HTMLElement>('[data-range]')
	const listElement = documentRef.querySelector<HTMLElement>('[data-list]')
	const refreshButton =
		documentRef.querySelector<HTMLButtonElement>('[data-refresh]')
	const gkiElement = documentRef.querySelector<HTMLElement>('[data-gki]')

	function applyTheme(theme: string | undefined) {
		if (theme === 'dark' || theme === 'light') {
			themeRoot.setAttribute('data-theme', theme)
			return
		}
		themeRoot.removeAttribute('data-theme')
	}

	const hostBridge = createWidgetHostBridge({
		appInfo: { name: 'keto-log-widget', version: '1.0.0' },
		onRenderData: (renderData) => applyTheme(readTheme(renderData)),
		onHostContextChanged: (hostContext) => applyTheme(readTheme(hostContext)),
	})

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

	function renderError(message: string) {
		if (!listElement) return
		listElement.replaceChildren()
		const li = documentRef.createElement('li')
		li.className = 'keto-list-error'
		li.textContent = message
		listElement.appendChild(li)
	}

	function renderEmpty() {
		if (!listElement) return
		listElement.replaceChildren()
		const li = documentRef.createElement('li')
		li.className = 'keto-list-empty'
		li.textContent = 'No entries yet today.'
		listElement.appendChild(li)
	}

	function renderEntries(entries: ReadonlyArray<EntryPayload>) {
		if (!listElement) return
		if (entries.length === 0) {
			renderEmpty()
			return
		}
		listElement.replaceChildren()
		for (const entry of entries) {
			const summary = summarizeEntry(entry)
			const li = documentRef.createElement('li')
			li.className = 'keto-list-item'
			li.setAttribute('data-entry-id', String(entry.id))
			li.setAttribute('data-entry-kind', entry.kind)

			const time = documentRef.createElement('span')
			time.className = 'keto-list-item-time'
			time.textContent = `${summary.icon} ${formatTimestamp(summary.at)}`

			const main = documentRef.createElement('span')
			main.textContent = summary.label

			const meta = documentRef.createElement('span')
			meta.className = 'keto-list-item-meta'
			meta.textContent = summary.meta

			li.append(time, main, meta)
			listElement.appendChild(li)
		}
	}

	async function loadToday() {
		const fromIso = startOfTodayIso()
		const toIso = endOfTodayIso()
		const url = new URL(apiUrl, windowRef.location.href)
		url.searchParams.set('from', fromIso)
		url.searchParams.set('to', toIso)
		if (rangeElement) {
			rangeElement.textContent = new Date().toLocaleDateString(undefined, {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
			})
		}
		try {
			const response = await fetch(url.toString(), {
				credentials: 'include',
				headers: { Accept: 'application/json' },
			})
			if (!response.ok) {
				renderError(
					response.status === 401
						? 'Sign in to the keto tracker to see your log.'
						: 'Could not load your log.',
				)
				return
			}
			const payload = (await response.json()) as ApiResponse
			setStat(rootElement, 'kcal', payload.totals.kcal, payload.goals.dailyKcal)
			setStat(rootElement, 'fat', payload.totals.fatG, payload.goals.dailyFatG)
			setStat(
				rootElement,
				'netCarbs',
				payload.totals.netCarbsG,
				payload.goals.dailyNetCarbsG,
			)
			setStat(
				rootElement,
				'protein',
				payload.totals.proteinG,
				payload.goals.dailyProteinG,
			)
			renderEntries(payload.entries)
			if (gkiElement) {
				gkiElement.textContent = payload.latestGki
					? `GKI: ${formatNumber(payload.latestGki.gki, 2)}`
					: 'GKI: —'
			}
		} catch {
			renderError('Could not load your log.')
		}
	}

	refreshButton?.addEventListener('click', () => {
		void loadToday()
	})

	windowRef.addEventListener('message', (event) => {
		hostBridge.handleHostMessage(event.data)
	})

	void hostBridge.initialize()
	hostBridge.requestRenderData()
	void loadToday()
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializeKetoLogWidget, {
		once: true,
	})
} else {
	initializeKetoLogWidget()
}

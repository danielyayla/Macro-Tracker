export const ketoLogUiResourceUri =
	'ui://keto-log-app/entry-point.html' as const

export function renderKetoLogUiEntryPoint(baseUrl: string | URL) {
	const stylesheetHref = new URL('/styles.css', baseUrl).toString()
	const widgetScriptHref = new URL(
		'/mcp-apps/keto-log-widget.js',
		baseUrl,
	).toString()
	const apiHref = new URL('/keto-entries', baseUrl).toString()

	return `
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Keto log</title>
		<link rel="stylesheet" href="${stylesheetHref}" />
		<style>
			:root {
				color-scheme: light dark;
			}

			:root[data-theme='light'] {
				color-scheme: light;
			}

			:root[data-theme='dark'] {
				color-scheme: dark;
			}

			* {
				box-sizing: border-box;
			}

			html,
			body {
				height: 100%;
			}

			body {
				margin: 0;
				padding: 0;
				font-family: var(--font-family);
				font-size: var(--font-size-base);
				color: var(--color-text);
				background: var(--color-background);
				overflow: hidden;
			}

			.keto-root {
				width: min(100%, 32rem);
				height: 100%;
				margin: 0 auto;
				padding: var(--spacing-sm);
				display: flex;
				flex-direction: column;
				gap: var(--spacing-sm);
				border-radius: var(--radius-lg);
				border: 1px solid var(--color-border);
				background-color: var(--color-surface);
				box-shadow: var(--shadow-sm);
				min-height: 0;
			}

			.keto-header {
				display: flex;
				flex-direction: column;
				gap: var(--spacing-xs);
			}

			.keto-title {
				margin: 0;
				font-size: var(--font-size-base);
				font-weight: var(--font-weight-semibold);
				color: var(--color-text);
			}

			.keto-subtitle {
				margin: 0;
				font-size: var(--font-size-sm);
				color: var(--color-text-muted);
			}

			.keto-totals {
				display: grid;
				grid-template-columns: repeat(4, minmax(0, 1fr));
				gap: var(--spacing-xs);
			}

			.keto-stat {
				border-radius: var(--radius-md);
				border: 1px solid var(--color-border);
				background: color-mix(
					in srgb,
					var(--color-background) 72%,
					var(--color-surface)
				);
				padding: var(--spacing-xs);
				display: grid;
				gap: 2px;
				font-variant-numeric: tabular-nums;
			}

			.keto-stat-label {
				font-size: var(--font-size-sm);
				color: var(--color-text-muted);
			}

			.keto-stat-value {
				font-weight: var(--font-weight-semibold);
				color: var(--color-text);
			}

			.keto-stat-progress {
				font-size: var(--font-size-sm);
				color: var(--color-text-muted);
			}

			.keto-stat.over .keto-stat-value {
				color: var(--color-error, #c0392b);
			}

			.keto-list {
				flex: 1 1 auto;
				min-height: 0;
				overflow-y: auto;
				display: grid;
				gap: var(--spacing-xs);
				margin: 0;
				padding: 0;
				list-style: none;
			}

			.keto-list-item {
				border-radius: var(--radius-md);
				border: 1px solid var(--color-border);
				padding: var(--spacing-xs) var(--spacing-sm);
				background-color: var(--color-background);
				display: grid;
				grid-template-columns: auto 1fr auto;
				gap: var(--spacing-xs);
				align-items: center;
			}

			.keto-list-item-time {
				font-variant-numeric: tabular-nums;
				font-size: var(--font-size-sm);
				color: var(--color-text-muted);
			}

			.keto-list-item-meta {
				font-size: var(--font-size-sm);
				color: var(--color-text-muted);
			}

			.keto-list-empty {
				padding: var(--spacing-md);
				color: var(--color-text-muted);
				text-align: center;
			}

			.keto-list-error {
				padding: var(--spacing-md);
				color: var(--color-error, #c0392b);
				text-align: center;
			}

			.keto-footer {
				display: flex;
				justify-content: space-between;
				align-items: center;
				gap: var(--spacing-sm);
				font-size: var(--font-size-sm);
				color: var(--color-text-muted);
			}

			.keto-refresh {
				border: 1px solid var(--color-border);
				background-color: var(--color-surface);
				color: var(--color-text);
				padding: var(--spacing-xs) var(--spacing-sm);
				border-radius: var(--radius-md);
				cursor: pointer;
				font-family: var(--font-family);
				font-size: var(--font-size-sm);
			}

			.keto-refresh:hover {
				background-color: color-mix(
					in srgb,
					var(--color-surface) 78%,
					var(--color-primary) 22%
				);
			}
		</style>
	</head>
	<body>
		<section class="keto-root" data-keto-log-ui data-api="${apiHref}">
			<header class="keto-header">
				<h1 class="keto-title">Today's keto log</h1>
				<p class="keto-subtitle" data-range>Loading…</p>
			</header>

			<div class="keto-totals" role="group" aria-label="Daily totals">
				<div class="keto-stat" data-stat="kcal">
					<span class="keto-stat-label">kcal</span>
					<span class="keto-stat-value" data-stat-value>—</span>
					<span class="keto-stat-progress" data-stat-progress></span>
				</div>
				<div class="keto-stat" data-stat="fat">
					<span class="keto-stat-label">fat (g)</span>
					<span class="keto-stat-value" data-stat-value>—</span>
					<span class="keto-stat-progress" data-stat-progress></span>
				</div>
				<div class="keto-stat" data-stat="netCarbs">
					<span class="keto-stat-label">net carbs (g)</span>
					<span class="keto-stat-value" data-stat-value>—</span>
					<span class="keto-stat-progress" data-stat-progress></span>
				</div>
				<div class="keto-stat" data-stat="protein">
					<span class="keto-stat-label">protein (g)</span>
					<span class="keto-stat-value" data-stat-value>—</span>
					<span class="keto-stat-progress" data-stat-progress></span>
				</div>
			</div>

			<ul class="keto-list" data-list>
				<li class="keto-list-empty" data-empty>Loading entries…</li>
			</ul>

			<footer class="keto-footer">
				<span data-gki>GKI: —</span>
				<button class="keto-refresh" type="button" data-refresh>
					Refresh
				</button>
			</footer>
		</section>

		<script type="module" src="${widgetScriptHref}" crossorigin="anonymous"></script>
	</body>
</html>
`.trim()
}

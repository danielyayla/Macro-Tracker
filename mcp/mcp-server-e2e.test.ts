import { expect, test } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
	auth,
	type OAuthClientProvider,
} from '@modelcontextprotocol/sdk/client/auth.js'
import {
	type OAuthClientInformationMixed,
	type OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import {
	type CallToolResult,
	type ContentBlock,
} from '@modelcontextprotocol/sdk/types.js'
import getPort from 'get-port'
import { spawn } from 'node:child_process'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	captureOutput,
	createExitPromise,
	formatOutput,
	stopProcess,
	type TrackedProcess,
} from '#test-support/process-utils.ts'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const migrationsDir = join(projectRoot, 'migrations')
const nodeBin = process.execPath
const wranglerCli = join(
	projectRoot,
	'node_modules',
	'wrangler',
	'wrangler-dist',
	'cli.js',
)
const defaultTimeoutMs = 60_000
const ketoLogUiResourceUri = 'ui://keto-log-app/entry-point.html'

const expectedToolNames = [
	'delete_entry',
	'get_goals',
	'get_log',
	'log_food',
	'log_glucose',
	'log_ketone',
	'open_log_ui',
	'set_goals',
	'update_entry',
]

const passwordHashPrefix = 'pbkdf2_sha256'
const passwordSaltBytes = 16
const passwordHashBytes = 32
const passwordHashIterations = 100_000

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function toHex(bytes: Uint8Array) {
	return Array.from(bytes)
		.map((value) => value.toString(16).padStart(2, '0'))
		.join('')
}

async function createPasswordHash(password: string) {
	const salt = crypto.getRandomValues(new Uint8Array(passwordSaltBytes))
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(password),
		'PBKDF2',
		false,
		['deriveBits'],
	)
	const derivedBits = await crypto.subtle.deriveBits(
		{
			name: 'PBKDF2',
			salt,
			iterations: passwordHashIterations,
			hash: 'SHA-256',
		},
		key,
		passwordHashBytes * 8,
	)
	return `${passwordHashPrefix}$${passwordHashIterations}$${toHex(salt)}$${toHex(
		new Uint8Array(derivedBits),
	)}`
}

function escapeSql(value: string) {
	return value.replace(/'/g, "''")
}

async function runWrangler(args: Array<string>) {
	const proc = spawn(
		nodeBin,
		['--no-warnings', '--experimental-vm-modules', wranglerCli, ...args],
		{
			cwd: projectRoot,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: {
				...process.env,
				CLOUDFLARE_ENV: 'test',
				NODE_OPTIONS: '',
			},
		},
	)
	const exitPromise = createExitPromise(proc)
	const stdoutPromise = proc.stdout
		? streamToText(proc.stdout)
		: Promise.resolve('')
	const stderrPromise = proc.stderr
		? streamToText(proc.stderr)
		: Promise.resolve('')
	const exitCode = await exitPromise
	const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise])
	if (exitCode !== 0) {
		throw new Error(
			`wrangler ${args.join(' ')} failed (${exitCode}). ${stderr || stdout}`,
		)
	}
	return { stdout, stderr }
}

async function createTestDatabase() {
	const persistDir = await mkdtemp(join(tmpdir(), 'macro-tracker-mcp-e2e-'))
	const user = {
		email: `mcp-${crypto.randomUUID()}@example.com`,
		password: `pw-${crypto.randomUUID()}`,
	}

	await applyMigrations(persistDir)

	const passwordHash = await createPasswordHash(user.password)
	const username = user.email.split('@')[0] || 'user'
	const insertSql = `INSERT INTO users (username, email, password_hash) VALUES ('${escapeSql(
		username,
	)}', '${escapeSql(user.email)}', '${escapeSql(passwordHash)}');`

	await runWrangler([
		'd1',
		'execute',
		'APP_DB',
		'--local',
		'--env',
		'test',
		'--persist-to',
		persistDir,
		'--command',
		insertSql,
	])

	return {
		persistDir,
		user,
		[Symbol.asyncDispose]: async () => {
			await rm(persistDir, { recursive: true, force: true })
		},
	}
}

async function applyMigrations(persistDir: string) {
	const migrationFiles = await listMigrationFiles()
	if (migrationFiles.length === 0) {
		throw new Error('No migration files found in migrations directory.')
	}

	for (const migrationFile of migrationFiles) {
		await runWrangler([
			'd1',
			'execute',
			'APP_DB',
			'--local',
			'--env',
			'test',
			'--persist-to',
			persistDir,
			'--file',
			join('migrations', migrationFile),
		])
	}
}

async function listMigrationFiles() {
	const entries = await readdir(migrationsDir, { withFileTypes: true })
	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
		.map((entry) => entry.name)
		.sort((left, right) => left.localeCompare(right))
}

function streamToText(
	stream: NodeJS.ReadableStream | null | undefined,
): Promise<string> {
	if (!stream) return Promise.resolve('')
	return new Promise((resolve, reject) => {
		let output = ''
		stream.setEncoding('utf8')
		stream.on('data', (chunk) => {
			output += chunk
		})
		stream.on('end', () => resolve(output))
		stream.on('error', reject)
	})
}

async function waitForServer(
	origin: string,
	process: TrackedProcess,
	getStdout: () => string,
	getStderr: () => string,
) {
	let exited = false
	let exitCode: number | null = null
	void process.exitPromise
		.then((code) => {
			exited = true
			exitCode = code
		})
		.catch(() => {
			exited = true
		})

	const metadataUrl = new URL('/.well-known/oauth-protected-resource', origin)
	const deadline = Date.now() + 25_000
	while (Date.now() < deadline) {
		if (exited) {
			throw new Error(
				`wrangler dev exited (${exitCode ?? 'unknown'}).${formatOutput(
					getStdout(),
					getStderr(),
				)}`,
			)
		}
		try {
			const response = await fetch(metadataUrl)
			if (response.ok) {
				await response.body?.cancel()
				return
			}
		} catch {
			// Retry until the server is ready.
		}
		await delay(250)
	}

	throw new Error(
		`Timed out waiting for dev server at ${origin}.${formatOutput(
			getStdout(),
			getStderr(),
		)}`,
	)
}

async function startDevServer(persistDir: string) {
	const port = await getPort({ host: '127.0.0.1' })
	const inspectorPortBase =
		port + 10_000 <= 65_535 ? port + 10_000 : Math.max(1, port - 10_000)
	const inspectorPort = await getPort({
		host: '127.0.0.1',
		port: Array.from(
			{ length: 10 },
			(_, index) => inspectorPortBase + index,
		).filter((candidate) => candidate > 0 && candidate <= 65_535),
	})
	const origin = `http://127.0.0.1:${port}`
	const proc = spawn(
		nodeBin,
		[
			'--no-warnings',
			'--experimental-vm-modules',
			wranglerCli,
			'dev',
			'--local',
			'--env',
			'test',
			'--port',
			String(port),
			'--inspector-port',
			String(inspectorPort),
			'--ip',
			'127.0.0.1',
			'--persist-to',
			persistDir,
			'--show-interactive-dev-session=false',
			'--log-level',
			'error',
		],
		{
			cwd: projectRoot,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: {
				...process.env,
				CLOUDFLARE_ENV: 'test',
				NODE_OPTIONS: '',
			},
		},
	)
	const trackedProcess: TrackedProcess = {
		proc,
		exitPromise: createExitPromise(proc),
	}

	const getStdout = captureOutput(proc.stdout)
	const getStderr = captureOutput(proc.stderr)

	await waitForServer(origin, trackedProcess, getStdout, getStderr)

	return {
		origin,
		[Symbol.asyncDispose]: async () => {
			await stopProcess(trackedProcess)
		},
	}
}

async function authorizeWithPassword(
	authorizationUrl: URL,
	user: { email: string; password: string },
	options: { simulateInteractiveAuthorize?: boolean } = {},
) {
	if (options.simulateInteractiveAuthorize) {
		const authorizeInfoUrl = new URL('/oauth/authorize-info', authorizationUrl)
		authorizeInfoUrl.search = authorizationUrl.search
		const authorizeInfoResponse = await fetch(authorizeInfoUrl, {
			headers: { Accept: 'application/json' },
		})
		const authorizeInfoPayload = (await authorizeInfoResponse
			.json()
			.catch(() => null)) as unknown
		const authorizeInfo =
			authorizeInfoPayload &&
			typeof authorizeInfoPayload === 'object' &&
			'ok' in authorizeInfoPayload
				? (authorizeInfoPayload as { ok?: unknown })
				: null
		if (!authorizeInfoResponse.ok || authorizeInfo?.ok !== true) {
			throw new Error(
				`OAuth authorize-info failed (${authorizeInfoResponse.status}). ${JSON.stringify(authorizeInfoPayload)}`,
			)
		}
	}

	const response = await fetch(authorizationUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json',
		},
		body: new URLSearchParams({
			decision: 'approve',
			email: user.email,
			password: user.password,
		}),
	})
	const payload = (await response.json().catch(() => null)) as unknown

	if (!response.ok || !payload || typeof payload !== 'object') {
		throw new Error(
			`OAuth approval failed (${response.status}). ${JSON.stringify(payload)}`,
		)
	}

	const approval = payload as { ok?: unknown; redirectTo?: unknown }
	if (approval.ok !== true || typeof approval.redirectTo !== 'string') {
		throw new Error(
			`OAuth approval failed (${response.status}). ${JSON.stringify(payload)}`,
		)
	}

	const redirectUrl = new URL(approval.redirectTo)
	const code = redirectUrl.searchParams.get('code')
	if (!code) {
		throw new Error('Authorization response missing code.')
	}
	return code
}

type TestOAuthProvider = OAuthClientProvider & {
	waitForAuthorizationCode: () => Promise<string>
}

function createOAuthProvider({
	redirectUrl,
	clientMetadata,
	authorize,
}: {
	redirectUrl: URL
	clientMetadata: OAuthClientProvider['clientMetadata']
	authorize: (authorizationUrl: URL) => Promise<string>
}): TestOAuthProvider {
	let clientInformation: OAuthClientInformationMixed | undefined
	let tokens: OAuthTokens | undefined
	let codeVerifier: string | undefined
	let authorizationCode: Promise<string> | undefined

	return {
		redirectUrl,
		clientMetadata,
		clientInformation() {
			return clientInformation
		},
		saveClientInformation(nextClientInfo) {
			clientInformation = nextClientInfo
		},
		tokens() {
			return tokens
		},
		saveTokens(nextTokens) {
			tokens = nextTokens
		},
		redirectToAuthorization(authorizationUrl) {
			authorizationCode = authorize(authorizationUrl)
		},
		saveCodeVerifier(nextCodeVerifier) {
			codeVerifier = nextCodeVerifier
		},
		codeVerifier() {
			if (!codeVerifier) {
				throw new Error('No code verifier saved')
			}
			return codeVerifier
		},
		async waitForAuthorizationCode() {
			if (!authorizationCode) {
				throw new Error('Authorization flow was not started')
			}
			return authorizationCode
		},
	}
}

async function ensureAuthorized(
	serverUrl: URL,
	transport: StreamableHTTPClientTransport,
	provider: TestOAuthProvider,
) {
	const result = await auth(provider, { serverUrl })
	if (result === 'AUTHORIZED') {
		return
	}
	const authorizationCode = await provider.waitForAuthorizationCode()
	await transport.finishAuth(authorizationCode)
}

async function createMcpClient(
	origin: string,
	user: { email: string; password: string },
	options: { simulateInteractiveAuthorize?: boolean } = {},
) {
	const redirectUrl = new URL('/oauth/callback', origin)
	const provider = createOAuthProvider({
		redirectUrl,
		clientMetadata: {
			client_name: 'mcp-e2e-client',
			redirect_uris: [redirectUrl.toString()],
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code'],
			token_endpoint_auth_method: 'client_secret_post',
		},
		authorize: (authorizationUrl) =>
			authorizeWithPassword(authorizationUrl, user, options),
	})
	const serverUrl = new URL('/mcp', origin)
	const transport = new StreamableHTTPClientTransport(serverUrl, {
		authProvider: provider,
	})
	const client = new Client(
		{ name: 'mcp-e2e', version: '1.0.0' },
		{ capabilities: {} },
	)

	await ensureAuthorized(serverUrl, transport, provider)
	await client.connect(transport)

	return {
		client,
		[Symbol.asyncDispose]: async () => {
			await client.close()
		},
	}
}

test(
	'mcp server lists tools after interactive oauth authorize flow',
	{ timeout: defaultTimeoutMs },
	async () => {
		await using database = await createTestDatabase()
		await using server = await startDevServer(database.persistDir)
		await using mcpClient = await createMcpClient(
			server.origin,
			database.user,
			{
				simulateInteractiveAuthorize: true,
			},
		)

		const result = await mcpClient.client.listTools()
		const toolNames = result.tools.map((tool) => tool.name)

		expect(toolNames.sort()).toEqual(expectedToolNames)
	},
)

test(
	'mcp server lists tools after oauth flow',
	{ timeout: defaultTimeoutMs },
	async () => {
		await using database = await createTestDatabase()
		await using server = await startDevServer(database.persistDir)
		await using mcpClient = await createMcpClient(server.origin, database.user)

		const instructions = mcpClient.client.getInstructions() ?? ''
		expect(instructions).toContain('Quick start')

		const result = await mcpClient.client.listTools()
		const toolNames = result.tools.map((tool) => tool.name)

		expect(toolNames.sort()).toEqual(expectedToolNames)

		const resourcesResult = await mcpClient.client.listResources()
		const resourceUris = resourcesResult.resources.map(
			(resource) => resource.uri,
		)

		expect(resourceUris).toContain(ketoLogUiResourceUri)
	},
)

test(
	'mcp server logs food and reads it back via get_log',
	{ timeout: defaultTimeoutMs },
	async () => {
		await using database = await createTestDatabase()
		await using server = await startDevServer(database.persistDir)
		await using mcpClient = await createMcpClient(server.origin, database.user)

		const logResult = await mcpClient.client.callTool({
			name: 'log_food',
			arguments: {
				name: 'Bunless cheeseburger',
				kcal: 540,
				fat_g: 42,
				carbs_g: 6,
				fiber_g: 1,
				protein_g: 32,
				serving: '1 patty',
			},
		})
		const logStructured = (logResult as CallToolResult).structuredContent as
			| Record<string, unknown>
			| undefined
		const loggedEntry = logStructured?.entry as
			| { id: number; netCarbsG: number; kcal: number }
			| undefined
		expect(loggedEntry).toBeDefined()
		expect(loggedEntry?.netCarbsG).toBe(5)
		expect(loggedEntry?.kcal).toBe(540)

		const ketoneResult = await mcpClient.client.callTool({
			name: 'log_ketone',
			arguments: { value: 1.8, unit: 'mmol_L_blood' },
		})
		expect((ketoneResult as CallToolResult).isError).not.toBe(true)

		const glucoseResult = await mcpClient.client.callTool({
			name: 'log_glucose',
			arguments: { value: 90, unit: 'mg_dL' },
		})
		expect((glucoseResult as CallToolResult).isError).not.toBe(true)

		const logRange = await mcpClient.client.callTool({
			name: 'get_log',
			arguments: {},
		})
		const rangeStructured = (logRange as CallToolResult).structuredContent as
			| {
					entries: Array<{ kind: string }>
					totals: { kcal: number; netCarbsG: number }
					latestGki: { gki: number } | null
			  }
			| undefined
		expect(rangeStructured?.entries.length).toBe(3)
		expect(rangeStructured?.totals.kcal).toBe(540)
		expect(rangeStructured?.totals.netCarbsG).toBe(5)
		expect(rangeStructured?.latestGki?.gki).toBeCloseTo(90 / 18 / 1.8, 4)
	},
)

test(
	'mcp server opens log ui tool and serves resource entry point',
	{ timeout: defaultTimeoutMs },
	async () => {
		await using database = await createTestDatabase()
		await using server = await startDevServer(database.persistDir)
		await using mcpClient = await createMcpClient(server.origin, database.user)

		const result = await mcpClient.client.callTool({
			name: 'open_log_ui',
		})

		const structuredResult = (result as CallToolResult).structuredContent as
			| Record<string, unknown>
			| undefined
		expect(structuredResult?.widget).toBe('keto-log')
		expect(structuredResult?.resourceUri).toBe(ketoLogUiResourceUri)

		const textOutput =
			(result as CallToolResult).content.find(
				(item): item is Extract<ContentBlock, { type: 'text' }> =>
					item.type === 'text',
			)?.text ?? ''
		expect(textOutput).toContain('Keto log widget')

		const resourceResult = await mcpClient.client.readResource({
			uri: ketoLogUiResourceUri,
		})
		const ketoLogResource = resourceResult.contents.find(
			(content): content is { uri: string; mimeType?: string; text: string } =>
				content.uri === ketoLogUiResourceUri &&
				'text' in content &&
				typeof content.text === 'string',
		)
		const ketoLogResourceMeta = (
			resourceResult.contents.find(
				(content) => content.uri === ketoLogUiResourceUri,
			) as { _meta?: Record<string, unknown> } | undefined
		)?._meta as
			| {
					ui?: {
						domain?: string
						csp?: {
							resourceDomains?: Array<string>
						}
					}
					'openai/widgetDomain'?: string
			  }
			| undefined

		expect(ketoLogResource).toBeDefined()
		expect(ketoLogResource?.mimeType).toBe('text/html;profile=mcp-app')
		expect(ketoLogResource?.text).toContain('data-keto-log-ui')
		expect(ketoLogResource?.text).toContain('rel="stylesheet"')
		expect(ketoLogResource?.text).toContain('styles.css')
		expect(ketoLogResource?.text).toContain('--color-primary')
		expect(ketoLogResource?.text).toContain('--color-background')
		expect(ketoLogResource?.text).toContain("data-theme='dark'")
		expect(ketoLogResource?.text).toContain('type="module"')
		expect(ketoLogResource?.text).toContain('/mcp-apps/keto-log-widget.js')

		const widgetResponse = await fetch(
			new URL('/mcp-apps/keto-log-widget.js', server.origin),
		)
		expect(widgetResponse.ok).toBe(true)
		expect(widgetResponse.headers.get('access-control-allow-origin')).toBe('*')
		const widgetSource = await widgetResponse.text()
		expect(widgetSource).toContain('createWidgetHostBridge')
		expect(widgetSource).toContain('keto-log-widget')
		expect(widgetSource).toContain('ui/initialize')

		const stylesResponse = await fetch(new URL('/styles.css', server.origin))
		expect(stylesResponse.ok).toBe(true)
		expect(stylesResponse.headers.get('access-control-allow-origin')).toBe('*')

		const sandboxDigest = await crypto.subtle.digest(
			'SHA-256',
			new TextEncoder().encode(`${server.origin}/mcp`),
		)
		const sandboxHash = Array.from(new Uint8Array(sandboxDigest))
			.map((value) => value.toString(16).padStart(2, '0'))
			.join('')
			.slice(0, 32)
		const expectedSandboxDomain = `${sandboxHash}.claudemcpcontent.com`

		expect(ketoLogResourceMeta?.ui?.domain).toBe(expectedSandboxDomain)
		expect(ketoLogResourceMeta?.['openai/widgetDomain']).toBe(server.origin)
		expect(ketoLogResourceMeta?.ui?.csp?.resourceDomains).toContain(
			server.origin,
		)
	},
)

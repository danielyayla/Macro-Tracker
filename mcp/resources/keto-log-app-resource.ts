import {
	RESOURCE_MIME_TYPE,
	registerAppResource,
} from '@modelcontextprotocol/ext-apps/server'
import { createUIResource } from '@mcp-ui/server'
import {
	ketoLogUiResourceUri,
	renderKetoLogUiEntryPoint,
} from '#mcp/apps/keto-log-ui-entry-point.ts'
import { type MCP } from '#mcp/index.ts'
import { toHex } from '#server/hex.ts'

const ketoLogAppResource = {
	name: 'keto_log_app_resource',
	title: 'Keto Log App Resource',
	description:
		'Interactive keto-log timeline app entry point rendered by MCP App compatible hosts.',
} as const

// Claude.ai requires ui.domain to be a deterministic sandbox subdomain derived
// from the MCP endpoint URL: sha256(mcpUrl).slice(0, 32) + '.claudemcpcontent.com'.
async function computeClaudeMcpContentDomain(mcpUrl: string) {
	const data = new TextEncoder().encode(mcpUrl)
	const digest = await crypto.subtle.digest('SHA-256', data)
	const hash = toHex(new Uint8Array(digest)).slice(0, 32)
	return `${hash}.claudemcpcontent.com`
}

export async function registerKetoLogAppResource(agent: MCP) {
	const baseUrl = agent.requireDomain()
	const workerOrigin = new URL('/styles.css', baseUrl).origin
	const sandboxDomain = await computeClaudeMcpContentDomain(
		`${workerOrigin}/mcp`,
	)

	registerAppResource(
		agent.server,
		ketoLogAppResource.name,
		ketoLogUiResourceUri,
		{
			title: ketoLogAppResource.title,
			description: ketoLogAppResource.description,
		},
		async () => {
			const ketoLogUiResource = createUIResource({
				uri: ketoLogUiResourceUri,
				content: {
					type: 'rawHtml',
					htmlString: renderKetoLogUiEntryPoint(baseUrl),
				},
				encoding: 'text',
				adapters: {
					mcpApps: {
						enabled: true,
					},
				},
			})

			return {
				contents: [
					{
						...ketoLogUiResource.resource,
						mimeType: RESOURCE_MIME_TYPE,
						_meta: {
							ui: {
								prefersBorder: true,
								domain: sandboxDomain,
								csp: {
									resourceDomains: [workerOrigin],
								},
							},
							'openai/widgetDomain': workerOrigin,
						},
					},
				],
			}
		},
	)
}

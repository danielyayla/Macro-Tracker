import { expect, test } from './playwright-utils.ts'

test('redirects to login when unauthenticated', async ({ page }) => {
	await page.goto('/chat')
	await expect(page).toHaveURL(/\/login/)
})

test('loads chat page when authenticated', async ({ page, login }) => {
	await login()
	await page.goto('/chat')
	await expect(
		page.getByRole('heading', { name: 'Chats', exact: true }),
	).toBeVisible()
	await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible()
	await expect(
		page.getByRole('button', { name: 'Create your first thread' }),
	).toHaveCount(0)
})

test('creates and deletes chat threads when authenticated', async ({
	page,
	login,
}) => {
	await login()
	await page.goto('/chat')

	await page.getByRole('textbox', { name: 'Message' }).fill('Hello there')
	await page.getByRole('button', { name: 'Send message' }).click()
	await expect(page).toHaveURL(/\/chat\/.+/)
	await expect(page.getByRole('heading', { name: 'New chat' })).toBeVisible()
	await expect(
		page
			.getByRole('complementary')
			.getByText('This is a mock completion', { exact: false }),
	).toBeVisible()
	await expect(
		page.locator('#chat-messages-scroll-container').getByText('Hello there'),
	).toBeVisible()

	await page
		.getByRole('complementary')
		.getByRole('button', { name: 'Delete' })
		.first()
		.click({ force: true })
	await page.getByRole('button', { name: /confirm delete chat/i }).click()
	await expect(page).toHaveURL(/\/chat$/)
	await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible()
	await expect(page.getByRole('heading', { name: 'New chat' })).toHaveCount(0)
})

test('responds to mock tool commands in chat', async ({ page, login }) => {
	await login()
	await page.goto('/chat')

	const command =
		'tool:log_food;name=Avocado;kcal=240;fat_g=22;carbs_g=12;fiber_g=10;protein_g=3'
	await page.getByRole('textbox', { name: 'Message' }).fill(command)
	await page.getByRole('button', { name: 'Send message' }).click()

	await expect(page).toHaveURL(/\/chat\/.+/)
	await expect(
		page.locator('#chat-messages-scroll-container').getByText(command),
	).toBeVisible()
	await expect(
		page
			.locator('#chat-messages-scroll-container')
			.getByText('## ✅ Logged food', { exact: false }),
	).toBeVisible()
	await expect(
		page
			.locator('#chat-messages-scroll-container')
			.getByText('**Avocado**', { exact: false }),
	).toBeVisible()
})

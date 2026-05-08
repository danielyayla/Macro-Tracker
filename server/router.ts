import { createRouter } from 'remix/fetch-router'
import { type AppEnv } from '#types/env-schema.ts'
import { account } from './handlers/account.ts'
import { createAuthHandler } from './handlers/auth.ts'
import { chat } from './handlers/chat.ts'
import {
	createChatThreadsHandler,
	createDeleteChatThreadHandler,
	createUpdateChatThreadHandler,
} from './handlers/chat-threads.ts'
import { createHealthHandler } from './handlers/health.ts'
import { home } from './handlers/home.ts'
import {
	createKetoEntriesDeleteHandler,
	createKetoEntriesHandler,
	createKetoEntriesUpdateHandler,
} from './handlers/keto-entries.ts'
import { createKetoGoalsHandler } from './handlers/keto-goals.ts'
import { login } from './handlers/login.ts'
import { logout } from './handlers/logout.ts'
import {
	createPasswordResetConfirmHandler,
	createPasswordResetRequestHandler,
} from './handlers/password-reset.ts'
import { session } from './handlers/session.ts'
import { signup } from './handlers/signup.ts'
import { Layout } from './layout.ts'
import { render } from './render.ts'
import { routes } from './routes.ts'

export function createAppRouter(appEnv: AppEnv) {
	const router = createRouter({
		middleware: [],
		async defaultHandler() {
			return render(Layout({}))
		},
	})
	const chatThreadsHandler = createChatThreadsHandler(appEnv)
	const ketoEntriesHandler = createKetoEntriesHandler(appEnv)
	const ketoGoalsHandler = createKetoGoalsHandler(appEnv)

	router.map(routes.home, home)
	router.map(routes.chat, chat)
	router.map(routes.chatThread, chat)
	router.map(routes.chatThreads, chatThreadsHandler)
	router.map(routes.chatThreadsCreate, chatThreadsHandler)
	router.map(routes.chatThreadsUpdate, createUpdateChatThreadHandler(appEnv))
	router.map(routes.chatThreadsDelete, createDeleteChatThreadHandler(appEnv))
	router.map(routes.ketoEntries, ketoEntriesHandler)
	router.map(routes.ketoEntriesCreate, ketoEntriesHandler)
	router.map(routes.ketoEntriesUpdate, createKetoEntriesUpdateHandler(appEnv))
	router.map(routes.ketoEntriesDelete, createKetoEntriesDeleteHandler(appEnv))
	router.map(routes.ketoGoals, ketoGoalsHandler)
	router.map(routes.ketoGoalsUpdate, ketoGoalsHandler)
	router.map(routes.health, createHealthHandler(appEnv))
	router.map(routes.login, login)
	router.map(routes.signup, signup)
	router.map(routes.account, account)
	router.map(routes.auth, createAuthHandler(appEnv))
	router.map(routes.session, session)
	router.map(routes.logout, logout)
	router.map(
		routes.passwordResetRequest,
		createPasswordResetRequestHandler(appEnv),
	)
	router.map(
		routes.passwordResetConfirm,
		createPasswordResetConfirmHandler(appEnv),
	)

	return router
}

import { column as c, createDatabase, table, sql } from 'remix/data-table'
import { createD1DataTableAdapter } from './d1-data-table-adapter.ts'

export const usersTable = table({
	name: 'users',
	columns: {
		id: c.integer(),
		username: c.text(),
		email: c.text(),
		password_hash: c.text(),
		created_at: c.text(),
		updated_at: c.text(),
	},
	primaryKey: 'id',
})

export const passwordResetsTable = table({
	name: 'password_resets',
	columns: {
		id: c.integer(),
		user_id: c.integer(),
		token_hash: c.text(),
		expires_at: c.integer(),
		created_at: c.text(),
	},
	primaryKey: 'id',
})

export const chatThreadsTable = table({
	name: 'chat_threads',
	columns: {
		id: c.text(),
		user_id: c.integer(),
		title: c.text(),
		last_message_preview: c.text(),
		message_count: c.integer(),
		created_at: c.text(),
		updated_at: c.text(),
		deleted_at: c.text().nullable(),
	},
	primaryKey: 'id',
	timestamps: {
		createdAt: 'created_at',
		updatedAt: 'updated_at',
	},
})

const numeric = () => c.decimal(12, 4)

export const foodEntriesTable = table({
	name: 'food_entries',
	columns: {
		id: c.integer(),
		user_id: c.integer(),
		eaten_at: c.text(),
		name: c.text(),
		serving: c.text(),
		kcal: numeric(),
		fat_g: numeric(),
		carbs_g: numeric(),
		fiber_g: numeric(),
		protein_g: numeric(),
		notes: c.text(),
		raw_json: c.text().nullable(),
		source: c.text(),
		created_at: c.text(),
		updated_at: c.text(),
		deleted_at: c.text().nullable(),
	},
	primaryKey: 'id',
	timestamps: {
		createdAt: 'created_at',
		updatedAt: 'updated_at',
	},
})

export const ketoneReadingsTable = table({
	name: 'ketone_readings',
	columns: {
		id: c.integer(),
		user_id: c.integer(),
		measured_at: c.text(),
		value: numeric(),
		unit: c.text(),
		notes: c.text(),
		source: c.text(),
		created_at: c.text(),
		updated_at: c.text(),
		deleted_at: c.text().nullable(),
	},
	primaryKey: 'id',
	timestamps: {
		createdAt: 'created_at',
		updatedAt: 'updated_at',
	},
})

export const glucoseReadingsTable = table({
	name: 'glucose_readings',
	columns: {
		id: c.integer(),
		user_id: c.integer(),
		measured_at: c.text(),
		value: numeric(),
		unit: c.text(),
		notes: c.text(),
		source: c.text(),
		created_at: c.text(),
		updated_at: c.text(),
		deleted_at: c.text().nullable(),
	},
	primaryKey: 'id',
	timestamps: {
		createdAt: 'created_at',
		updatedAt: 'updated_at',
	},
})

export const userGoalsTable = table({
	name: 'user_goals',
	columns: {
		user_id: c.integer(),
		daily_kcal: numeric().nullable(),
		daily_fat_g: numeric().nullable(),
		daily_net_carbs_g: numeric().nullable(),
		daily_protein_g: numeric().nullable(),
		ketone_target_min: numeric().nullable(),
		ketone_target_max: numeric().nullable(),
		updated_at: c.text(),
	},
	primaryKey: 'user_id',
	timestamps: {
		updatedAt: 'updated_at',
	},
})

export function createDb(db: D1Database) {
	return createDatabase(createD1DataTableAdapter(db), {
		now: () => new Date().toISOString(),
	})
}

export type AppDatabase = ReturnType<typeof createDb>
export { sql }

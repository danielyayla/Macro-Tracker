CREATE TABLE IF NOT EXISTS food_entries (
	id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
	user_id INTEGER NOT NULL,
	eaten_at TEXT NOT NULL,
	name TEXT NOT NULL,
	serving TEXT NOT NULL DEFAULT '',
	kcal REAL NOT NULL,
	fat_g REAL NOT NULL,
	carbs_g REAL NOT NULL,
	fiber_g REAL NOT NULL DEFAULT 0,
	protein_g REAL NOT NULL DEFAULT 0,
	notes TEXT NOT NULL DEFAULT '',
	raw_json TEXT,
	source TEXT NOT NULL DEFAULT 'mcp',
	created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	deleted_at TEXT,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_food_entries_user_eaten
	ON food_entries(user_id, eaten_at DESC);
CREATE INDEX IF NOT EXISTS idx_food_entries_user_deleted
	ON food_entries(user_id, deleted_at);

CREATE TABLE IF NOT EXISTS ketone_readings (
	id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
	user_id INTEGER NOT NULL,
	measured_at TEXT NOT NULL,
	value REAL NOT NULL,
	unit TEXT NOT NULL,
	notes TEXT NOT NULL DEFAULT '',
	source TEXT NOT NULL DEFAULT 'mcp',
	created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	deleted_at TEXT,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ketone_readings_user_measured
	ON ketone_readings(user_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_ketone_readings_user_deleted
	ON ketone_readings(user_id, deleted_at);

CREATE TABLE IF NOT EXISTS glucose_readings (
	id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
	user_id INTEGER NOT NULL,
	measured_at TEXT NOT NULL,
	value REAL NOT NULL,
	unit TEXT NOT NULL,
	notes TEXT NOT NULL DEFAULT '',
	source TEXT NOT NULL DEFAULT 'mcp',
	created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	deleted_at TEXT,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_glucose_readings_user_measured
	ON glucose_readings(user_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_glucose_readings_user_deleted
	ON glucose_readings(user_id, deleted_at);

CREATE TABLE IF NOT EXISTS user_goals (
	user_id INTEGER PRIMARY KEY NOT NULL,
	daily_kcal REAL,
	daily_fat_g REAL,
	daily_net_carbs_g REAL,
	daily_protein_g REAL,
	ketone_target_min REAL,
	ketone_target_max REAL,
	updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

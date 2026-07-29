PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS client_visit_codes (
 id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, client_id TEXT NOT NULL,
 code TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1,
 created_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, revoked_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_visit_code_client_active ON client_visit_codes(organisation_id,client_id,active);
CREATE TABLE IF NOT EXISTS care_visits (
 id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, branch_id TEXT, client_id TEXT NOT NULL,
 staff_id TEXT, visit_type TEXT NOT NULL DEFAULT 'Care visit', scheduled_start TEXT NOT NULL,
 scheduled_end TEXT, status TEXT NOT NULL DEFAULT 'scheduled', actual_start TEXT, actual_end TEXT,
 clock_in_method TEXT, clock_out_method TEXT, clock_in_device_time TEXT, clock_out_device_time TEXT,
 clock_in_received_at TEXT, clock_out_received_at TEXT, notes TEXT DEFAULT '', exception_reason TEXT DEFAULT '',
 created_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_care_visits_live ON care_visits(organisation_id,scheduled_start,status);
CREATE TABLE IF NOT EXISTS visit_events (
 id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, visit_id TEXT NOT NULL, event_type TEXT NOT NULL,
 device_event_id TEXT NOT NULL UNIQUE, device_time TEXT NOT NULL, received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 source TEXT NOT NULL DEFAULT 'online', payload_json TEXT NOT NULL DEFAULT '{}', created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_visit_events_visit ON visit_events(visit_id,received_at);

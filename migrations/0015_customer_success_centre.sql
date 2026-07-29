-- CoreCare Enterprise 1.1.2 — Customer Success Centre
CREATE TABLE IF NOT EXISTS customer_success_notes (
 id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, created_by TEXT, note_type TEXT NOT NULL DEFAULT 'note', content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(organisation_id) REFERENCES organisations(id)
);
CREATE INDEX IF NOT EXISTS idx_customer_success_notes_org ON customer_success_notes(organisation_id,created_at);

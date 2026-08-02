-- CoreCare Connect compatibility migration v1.27.1
-- Reuses the existing Platform attachment schema (data_url / created_at).
ALTER TABLE platform_support_tickets ADD COLUMN module TEXT;
ALTER TABLE platform_support_tickets ADD COLUMN page_url TEXT;
ALTER TABLE platform_support_tickets ADD COLUMN app_version TEXT;
ALTER TABLE platform_support_tickets ADD COLUMN browser_info TEXT;
ALTER TABLE platform_support_tickets ADD COLUMN device_info TEXT;
ALTER TABLE platform_support_tickets ADD COLUMN branch_id TEXT;
ALTER TABLE platform_support_tickets ADD COLUMN first_response_at TEXT;
ALTER TABLE platform_support_tickets ADD COLUMN last_customer_reply_at TEXT;
ALTER TABLE platform_support_tickets ADD COLUMN last_support_reply_at TEXT;
CREATE TABLE IF NOT EXISTS platform_ticket_attachments (
 id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, uploaded_by TEXT, file_name TEXT NOT NULL, mime_type TEXT, size_bytes INTEGER NOT NULL DEFAULT 0, data_url TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(ticket_id) REFERENCES platform_support_tickets(id)
);
CREATE TABLE IF NOT EXISTS platform_ticket_status_history (
 id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL, changed_by TEXT, note TEXT, changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(ticket_id) REFERENCES platform_support_tickets(id)
);
CREATE INDEX IF NOT EXISTS idx_platform_ticket_org_updated ON platform_support_tickets(organisation_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_ticket_attach ON platform_ticket_attachments(ticket_id,created_at);
CREATE INDEX IF NOT EXISTS idx_platform_ticket_history ON platform_ticket_status_history(ticket_id,changed_at);

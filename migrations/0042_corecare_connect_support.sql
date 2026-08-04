-- CoreCare Connect compatibility migration v1.27.1
-- Reuses the existing Platform attachment schema (data_url / created_at).
-- The care database may not have received the Platform control-plane base tables,
-- so create the minimum compatible ticket schema before extending it.
CREATE TABLE IF NOT EXISTS platform_products (
 id TEXT PRIMARY KEY,
 code TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 description TEXT,
 status TEXT NOT NULL DEFAULT 'active',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO platform_products(id,code,name,description,status)
VALUES('product-care','CARE','CoreCare Care','Care management product','active');

CREATE TABLE IF NOT EXISTS platform_support_tickets (
 id TEXT PRIMARY KEY,
 ticket_number TEXT NOT NULL UNIQUE,
 product_id TEXT,
 organisation_id TEXT,
 subject TEXT NOT NULL,
 description TEXT,
 priority TEXT NOT NULL DEFAULT 'normal',
 category TEXT NOT NULL DEFAULT 'general',
 status TEXT NOT NULL DEFAULT 'new',
 assigned_to TEXT,
 created_by TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 resolved_at TEXT,
 FOREIGN KEY(product_id) REFERENCES platform_products(id),
 FOREIGN KEY(organisation_id) REFERENCES organisations(id)
);

CREATE TABLE IF NOT EXISTS platform_ticket_messages (
 id TEXT PRIMARY KEY,
 ticket_id TEXT NOT NULL,
 author_user_id TEXT,
 message_type TEXT NOT NULL DEFAULT 'customer_reply',
 body TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(ticket_id) REFERENCES platform_support_tickets(id),
 FOREIGN KEY(author_user_id) REFERENCES users(id)
);

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
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON platform_ticket_messages(ticket_id,created_at);
CREATE INDEX IF NOT EXISTS idx_platform_ticket_attach ON platform_ticket_attachments(ticket_id,created_at);
CREATE INDEX IF NOT EXISTS idx_platform_ticket_history ON platform_ticket_status_history(ticket_id,changed_at);

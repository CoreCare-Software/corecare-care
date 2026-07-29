-- CoreCare Sprint 10: organisation customisation and portal redesign
ALTER TABLE organisations ADD COLUMN short_name TEXT;
ALTER TABLE organisations ADD COLUMN secondary_colour TEXT DEFAULT '#0f172a';
ALTER TABLE organisations ADD COLUMN website TEXT;
ALTER TABLE organisations ADD COLUMN email_sender_name TEXT;
ALTER TABLE organisations ADD COLUMN login_message TEXT;
ALTER TABLE organisations ADD COLUMN dashboard_welcome TEXT;
ALTER TABLE organisations ADD COLUMN document_header TEXT;
ALTER TABLE organisations ADD COLUMN document_footer TEXT;
ALTER TABLE organisations ADD COLUMN invoice_footer TEXT;
ALTER TABLE organisations ADD COLUMN timezone TEXT DEFAULT 'Europe/London';
ALTER TABLE organisations ADD COLUMN currency TEXT DEFAULT 'GBP';
ALTER TABLE organisations ADD COLUMN date_format TEXT DEFAULT 'DD/MM/YYYY';
ALTER TABLE organisations ADD COLUMN time_format TEXT DEFAULT '24h';
ALTER TABLE organisations ADD COLUMN week_start TEXT DEFAULT 'monday';
ALTER TABLE organisations ADD COLUMN terminology_json TEXT DEFAULT '{}';
ALTER TABLE organisations ADD COLUMN dashboard_widgets_json TEXT DEFAULT '["metrics","attention","activity","compliance"]';
ALTER TABLE organisations ADD COLUMN sidebar_order_json TEXT DEFAULT '[]';

CREATE TABLE IF NOT EXISTS support_sessions (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  access_mode TEXT NOT NULL DEFAULT 'full',
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  session_id TEXT,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id),
  FOREIGN KEY (platform_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_support_sessions_org ON support_sessions(organisation_id,started_at);

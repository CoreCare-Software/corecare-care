PRAGMA foreign_keys = ON;

-- CoreCare Care 1.40.0 - consent-led family communication and sharing.
ALTER TABLE family_client_access ADD COLUMN relationship_label TEXT NOT NULL DEFAULT '';
ALTER TABLE family_client_access ADD COLUMN access_review_date TEXT;
ALTER TABLE family_client_access ADD COLUMN can_view_care_plan INTEGER NOT NULL DEFAULT 0;
ALTER TABLE family_client_access ADD COLUMN can_message_team INTEGER NOT NULL DEFAULT 1;
ALTER TABLE family_client_access ADD COLUMN revoked_at TEXT;
ALTER TABLE family_client_access ADD COLUMN revoked_by TEXT;
ALTER TABLE family_client_access ADD COLUMN revoke_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE family_client_access ADD COLUMN updated_at TEXT;

UPDATE family_client_access
SET access_review_date = date(COALESCE(consent_recorded_at, created_at, CURRENT_TIMESTAMP), '+1 year'),
    updated_at = CURRENT_TIMESTAMP
WHERE access_review_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_family_access_review
ON family_client_access(organisation_id, status, access_review_date);

CREATE TABLE IF NOT EXISTS family_shared_updates (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  branch_id TEXT,
  client_id TEXT NOT NULL,
  visit_id TEXT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'care',
  mood TEXT NOT NULL DEFAULT 'not_recorded',
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','withdrawn')),
  published_by TEXT,
  published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  withdrawn_by TEXT,
  withdrawn_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_family_updates_client
ON family_shared_updates(organisation_id, client_id, status, published_at DESC);

CREATE TABLE IF NOT EXISTS family_document_shares (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  access_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  shared_by TEXT,
  shared_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_by TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(access_id, document_id),
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (access_id) REFERENCES family_client_access(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES client_documents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_family_document_shares_access
ON family_document_shares(organisation_id, access_id, status, shared_at DESC);

CREATE TABLE IF NOT EXISTS family_message_threads (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  branch_id TEXT,
  client_id TEXT NOT NULL,
  access_id TEXT NOT NULL,
  family_user_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','important')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  created_by TEXT,
  last_message_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (access_id) REFERENCES family_client_access(id) ON DELETE CASCADE,
  FOREIGN KEY (family_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_family_threads_user
ON family_message_threads(organisation_id, family_user_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_family_threads_branch
ON family_message_threads(organisation_id, branch_id, status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS family_messages (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  sender_user_id TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK(sender_role IN ('family','care_team')),
  body TEXT NOT NULL,
  read_by_family_at TEXT,
  read_by_team_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES family_message_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_family_messages_thread
ON family_messages(organisation_id, thread_id, created_at);

CREATE TABLE IF NOT EXISTS family_portal_preferences (
  user_id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  in_app_notifications INTEGER NOT NULL DEFAULT 1,
  email_notifications INTEGER NOT NULL DEFAULT 1,
  visit_notifications INTEGER NOT NULL DEFAULT 1,
  care_update_notifications INTEGER NOT NULL DEFAULT 1,
  document_notifications INTEGER NOT NULL DEFAULT 1,
  message_notifications INTEGER NOT NULL DEFAULT 1,
  digest_frequency TEXT NOT NULL DEFAULT 'immediate' CHECK(digest_frequency IN ('immediate','daily','weekly','none')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS family_notifications (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  client_id TEXT,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  related_type TEXT,
  related_id TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_family_notifications_user
ON family_notifications(organisation_id, user_id, read_at, created_at DESC);

CREATE TRIGGER IF NOT EXISTS family_update_branch_guard_insert
BEFORE INSERT ON family_shared_updates
WHEN EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
    AND COALESCE(c.branch_id, '') <> COALESCE(NEW.branch_id, '')
)
BEGIN SELECT RAISE(ABORT, 'BRANCH_BOUNDARY: family update'); END;

CREATE TRIGGER IF NOT EXISTS family_thread_branch_guard_insert
BEFORE INSERT ON family_message_threads
WHEN EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
    AND COALESCE(c.branch_id, '') <> COALESCE(NEW.branch_id, '')
)
BEGIN SELECT RAISE(ABORT, 'BRANCH_BOUNDARY: family thread'); END;

CREATE TRIGGER IF NOT EXISTS family_document_share_guard_insert
BEFORE INSERT ON family_document_shares
WHEN NOT EXISTS (
  SELECT 1
  FROM family_client_access f
  JOIN client_documents d ON d.client_id = f.client_id AND d.organisation_id = f.organisation_id
  WHERE f.id = NEW.access_id AND d.id = NEW.document_id
    AND f.organisation_id = NEW.organisation_id
)
BEGIN SELECT RAISE(ABORT, 'TENANT_BOUNDARY: family document share'); END;

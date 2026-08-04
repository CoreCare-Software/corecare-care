PRAGMA foreign_keys = ON;

-- Incident investigation and learning trail.
ALTER TABLE operations_incidents ADD COLUMN reference_number TEXT;
ALTER TABLE operations_incidents ADD COLUMN branch_id TEXT;
ALTER TABLE operations_incidents ADD COLUMN injury_or_harm TEXT NOT NULL DEFAULT '';
ALTER TABLE operations_incidents ADD COLUMN immediate_action TEXT NOT NULL DEFAULT '';
ALTER TABLE operations_incidents ADD COLUMN witnesses TEXT NOT NULL DEFAULT '';
ALTER TABLE operations_incidents ADD COLUMN safeguarding_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE operations_incidents ADD COLUMN external_notification TEXT NOT NULL DEFAULT 'not_required';
ALTER TABLE operations_incidents ADD COLUMN external_reference TEXT NOT NULL DEFAULT '';
ALTER TABLE operations_incidents ADD COLUMN investigation_owner TEXT NOT NULL DEFAULT '';
ALTER TABLE operations_incidents ADD COLUMN investigation_due_at TEXT;
ALTER TABLE operations_incidents ADD COLUMN root_cause TEXT NOT NULL DEFAULT '';
ALTER TABLE operations_incidents ADD COLUMN actions_required TEXT NOT NULL DEFAULT '';
ALTER TABLE operations_incidents ADD COLUMN lessons_learned TEXT NOT NULL DEFAULT '';
ALTER TABLE operations_incidents ADD COLUMN closed_at TEXT;

UPDATE operations_incidents
SET reference_number='INC-' || strftime('%Y','now') || '-' || upper(substr(replace(id,'-',''),1,8)),
    branch_id=(SELECT c.branch_id FROM clients c WHERE c.id=operations_incidents.client_id AND c.organisation_id=operations_incidents.organisation_id)
WHERE reference_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_incidents_reference ON operations_incidents(organisation_id,reference_number);
CREATE INDEX IF NOT EXISTS idx_incidents_branch_review ON operations_incidents(organisation_id,branch_id,status,investigation_due_at);

CREATE TABLE IF NOT EXISTS incident_updates (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  incident_id TEXT NOT NULL,
  update_type TEXT NOT NULL DEFAULT 'review',
  status TEXT NOT NULL,
  note TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (incident_id) REFERENCES operations_incidents(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_incident_updates_timeline ON incident_updates(organisation_id,incident_id,created_at DESC);

-- Lightweight provider finance: cashbook, simple invoices and an external-software hand-off.
CREATE TABLE IF NOT EXISTS finance_settings (
  organisation_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'none',
  provider_url TEXT NOT NULL DEFAULT '',
  provider_label TEXT NOT NULL DEFAULT '',
  invoice_prefix TEXT NOT NULL DEFAULT 'CC',
  next_invoice_number INTEGER NOT NULL DEFAULT 1,
  default_tax_basis_points INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);
INSERT OR IGNORE INTO finance_settings(organisation_id) SELECT id FROM organisations;

CREATE TABLE IF NOT EXISTS finance_invoices (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  branch_id TEXT,
  invoice_number TEXT NOT NULL,
  client_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','paid','void')),
  subtotal_pence INTEGER NOT NULL,
  tax_pence INTEGER NOT NULL DEFAULT 0,
  total_pence INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  sent_at TEXT,
  paid_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organisation_id,invoice_number),
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_finance_invoices_register ON finance_invoices(organisation_id,branch_id,status,due_date);

CREATE TABLE IF NOT EXISTS finance_invoice_items (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price_pence INTEGER NOT NULL,
  tax_basis_points INTEGER NOT NULL DEFAULT 0,
  subtotal_pence INTEGER NOT NULL,
  tax_pence INTEGER NOT NULL DEFAULT 0,
  total_pence INTEGER NOT NULL,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (invoice_id) REFERENCES finance_invoices(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_finance_invoice_items ON finance_invoice_items(organisation_id,invoice_id);

CREATE TABLE IF NOT EXISTS finance_transactions (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  branch_id TEXT,
  client_id TEXT,
  invoice_id TEXT,
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('income','expense')),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_pence INTEGER NOT NULL,
  tax_pence INTEGER NOT NULL DEFAULT 0,
  transaction_date TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'cleared' CHECK(payment_status IN ('pending','cleared')),
  reference TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organisation_id,invoice_id),
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  FOREIGN KEY (invoice_id) REFERENCES finance_invoices(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_cashbook ON finance_transactions(organisation_id,branch_id,transaction_date,transaction_type);

-- Database-level tenant boundaries for the new linked records.
CREATE TRIGGER IF NOT EXISTS tenant_guard_incident_branch_insert
BEFORE INSERT ON operations_incidents
WHEN (NEW.branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM branches b WHERE b.id=NEW.branch_id AND b.organisation_id=NEW.organisation_id))
BEGIN SELECT RAISE(ABORT,'TENANT_BOUNDARY: incident branch'); END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_incident_update_insert
BEFORE INSERT ON incident_updates
WHEN NOT EXISTS (SELECT 1 FROM operations_incidents i WHERE i.id=NEW.incident_id AND i.organisation_id=NEW.organisation_id)
BEGIN SELECT RAISE(ABORT,'TENANT_BOUNDARY: incident update'); END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_finance_invoice_insert
BEFORE INSERT ON finance_invoices
WHEN NOT EXISTS (SELECT 1 FROM clients c WHERE c.id=NEW.client_id AND c.organisation_id=NEW.organisation_id)
  OR (NEW.branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM branches b WHERE b.id=NEW.branch_id AND b.organisation_id=NEW.organisation_id))
BEGIN SELECT RAISE(ABORT,'TENANT_BOUNDARY: finance invoice'); END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_finance_item_insert
BEFORE INSERT ON finance_invoice_items
WHEN NOT EXISTS (SELECT 1 FROM finance_invoices i WHERE i.id=NEW.invoice_id AND i.organisation_id=NEW.organisation_id)
BEGIN SELECT RAISE(ABORT,'TENANT_BOUNDARY: finance invoice item'); END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_finance_transaction_insert
BEFORE INSERT ON finance_transactions
WHEN (NEW.client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.id=NEW.client_id AND c.organisation_id=NEW.organisation_id))
  OR (NEW.invoice_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM finance_invoices i WHERE i.id=NEW.invoice_id AND i.organisation_id=NEW.organisation_id))
  OR (NEW.branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM branches b WHERE b.id=NEW.branch_id AND b.organisation_id=NEW.organisation_id))
BEGIN SELECT RAISE(ABORT,'TENANT_BOUNDARY: finance transaction'); END;

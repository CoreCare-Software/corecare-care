-- CoreCare 1.25.0 — eMAR Operations
ALTER TABLE medications ADD COLUMN low_stock_threshold REAL NOT NULL DEFAULT 5;
ALTER TABLE medications ADD COLUMN discontinued_reason TEXT;
ALTER TABLE medications ADD COLUMN discontinued_at TEXT;

ALTER TABLE medication_administrations ADD COLUMN scheduled_date TEXT;
ALTER TABLE medication_administrations ADD COLUMN prn_reason TEXT;
ALTER TABLE medication_administrations ADD COLUMN prn_effectiveness TEXT;
ALTER TABLE medication_administrations ADD COLUMN effectiveness_reviewed_at TEXT;
ALTER TABLE medication_administrations ADD COLUMN corrected_from_id TEXT;
ALTER TABLE medication_administrations ADD COLUMN correction_reason TEXT;
ALTER TABLE medication_administrations ADD COLUMN is_void INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mar_unique_schedule
ON medication_administrations(organisation_id,medication_id,scheduled_at)
WHERE scheduled_at IS NOT NULL AND is_void=0;

CREATE TABLE IF NOT EXISTS medication_stock_transactions (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  medication_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  quantity REAL NOT NULL,
  balance_after REAL,
  reason TEXT,
  administration_id TEXT,
  recorded_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(medication_id) REFERENCES medications(id),
  FOREIGN KEY(client_id) REFERENCES clients(id)
);
CREATE INDEX IF NOT EXISTS idx_med_stock_medication_time ON medication_stock_transactions(organisation_id,medication_id,created_at);

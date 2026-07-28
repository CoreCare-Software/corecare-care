-- CoreCare Enterprise 1.1.3 — Organisation 360
-- Adds account ownership fields used by future customer success workflows.
ALTER TABLE organisations ADD COLUMN customer_success_owner_id TEXT;
ALTER TABLE organisations ADD COLUMN account_manager_id TEXT;
ALTER TABLE organisations ADD COLUMN lifecycle_stage TEXT NOT NULL DEFAULT 'customer';
ALTER TABLE organisations ADD COLUMN next_success_review_date TEXT;
CREATE INDEX IF NOT EXISTS idx_organisations_success_owner ON organisations(customer_success_owner_id);
CREATE INDEX IF NOT EXISTS idx_organisations_lifecycle ON organisations(lifecycle_stage);

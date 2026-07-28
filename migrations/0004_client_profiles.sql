PRAGMA foreign_keys = ON;

ALTER TABLE clients ADD COLUMN preferred_name TEXT;
ALTER TABLE clients ADD COLUMN address_line_1 TEXT;
ALTER TABLE clients ADD COLUMN address_line_2 TEXT;
ALTER TABLE clients ADD COLUMN postcode TEXT;
ALTER TABLE clients ADD COLUMN phone TEXT;
ALTER TABLE clients ADD COLUMN email TEXT;
ALTER TABLE clients ADD COLUMN gp_name TEXT;
ALTER TABLE clients ADD COLUMN gp_practice TEXT;
ALTER TABLE clients ADD COLUMN gp_phone TEXT;
ALTER TABLE clients ADD COLUMN next_of_kin_name TEXT;
ALTER TABLE clients ADD COLUMN next_of_kin_relationship TEXT;
ALTER TABLE clients ADD COLUMN next_of_kin_phone TEXT;
ALTER TABLE clients ADD COLUMN emergency_contact_name TEXT;
ALTER TABLE clients ADD COLUMN emergency_contact_phone TEXT;
ALTER TABLE clients ADD COLUMN allergies TEXT;
ALTER TABLE clients ADD COLUMN communication_needs TEXT;
ALTER TABLE clients ADD COLUMN capacity_notes TEXT;
ALTER TABLE clients ADD COLUMN important_notes TEXT;
ALTER TABLE clients ADD COLUMN archived_at TEXT;

CREATE INDEX IF NOT EXISTS idx_clients_postcode ON clients(organisation_id, postcode);
CREATE INDEX IF NOT EXISTS idx_clients_archived ON clients(organisation_id, archived_at);

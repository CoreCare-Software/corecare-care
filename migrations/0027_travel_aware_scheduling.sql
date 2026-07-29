PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organisation_routing_settings (
  organisation_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'manual' CHECK(provider IN ('manual','mapbox')),
  default_travel_minutes INTEGER NOT NULL DEFAULT 15,
  parking_buffer_minutes INTEGER NOT NULL DEFAULT 5,
  cache_days INTEGER NOT NULL DEFAULT 90,
  block_conflicts INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS routing_location_cache (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  address_hash TEXT NOT NULL,
  formatted_address TEXT NOT NULL,
  longitude REAL,
  latitude REAL,
  provider TEXT NOT NULL DEFAULT 'manual',
  geocoded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organisation_id,entity_type,entity_id,address_hash)
);
CREATE INDEX IF NOT EXISTS idx_routing_location_entity ON routing_location_cache(organisation_id,entity_type,entity_id);

CREATE TABLE IF NOT EXISTS routing_route_cache (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  origin_hash TEXT NOT NULL,
  destination_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  distance_metres INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  UNIQUE(organisation_id,origin_hash,destination_hash,provider)
);
CREATE INDEX IF NOT EXISTS idx_routing_route_expiry ON routing_route_cache(organisation_id,expires_at);

ALTER TABLE care_visits ADD COLUMN travel_before_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE care_visits ADD COLUMN travel_after_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE care_visits ADD COLUMN travel_before_miles REAL NOT NULL DEFAULT 0;
ALTER TABLE care_visits ADD COLUMN travel_after_miles REAL NOT NULL DEFAULT 0;
ALTER TABLE care_visits ADD COLUMN travel_source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE care_visits ADD COLUMN travel_calculated_at TEXT;
ALTER TABLE care_visits ADD COLUMN travel_override INTEGER NOT NULL DEFAULT 0;
ALTER TABLE care_visits ADD COLUMN travel_override_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE care_visits ADD COLUMN travel_conflict INTEGER NOT NULL DEFAULT 0;
ALTER TABLE care_visits ADD COLUMN travel_conflict_minutes INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS travel_override_history (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  visit_id TEXT NOT NULL,
  calculated_minutes INTEGER NOT NULL,
  available_minutes INTEGER NOT NULL,
  shortfall_minutes INTEGER NOT NULL,
  reason TEXT NOT NULL,
  overridden_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_travel_override_visit ON travel_override_history(organisation_id,visit_id,created_at DESC);

INSERT OR IGNORE INTO permission_catalog(permission_key,name,description,category,risk_level) VALUES('rota.travel.override','Override travel safeguards','Permit a user to publish or allocate visits with insufficient calculated travel time.','Rota','high');
INSERT OR IGNORE INTO permission_catalog(permission_key,name,description,category,risk_level) VALUES('rota.travel.settings','Manage routing settings','Configure routing provider, buffers, caching and fallback travel times.','Rota','high');

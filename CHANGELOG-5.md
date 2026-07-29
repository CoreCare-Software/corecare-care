# CoreCare 0.5.0 — Sprint 5

## Added
- Full D1-backed client profile fields
- Individual client record view
- Address, contact, GP, next-of-kin and emergency contact details
- Allergies, communication, capacity and important notes
- Client archiving with owner/manager permission checks
- Quick Add client workflow
- Search across names, preferred name, town, postcode and NHS number

## Changed
- Client storage no longer falls back to browser local storage
- Client list now loads archived records for filtering
- Development version updated to 0.5.0

## Database
- Added migration `0004_client_profiles.sql`

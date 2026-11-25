-- Rollback for 030. Drops the four columns and any data stored in them (data is re-derivable from PF snapshots).
BEGIN;
ALTER TABLE re_units DROP COLUMN IF EXISTS description_ar;
ALTER TABLE re_units DROP COLUMN IF EXISTS description_en;
ALTER TABLE re_units DROP COLUMN IF EXISTS bathrooms;
ALTER TABLE re_units DROP COLUMN IF EXISTS furnishing;
COMMIT;

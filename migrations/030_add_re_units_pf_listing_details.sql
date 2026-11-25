-- =========================================================================
-- MIGRATION 030: re_units listing detail columns (Property Finder import)
-- =========================================================================
-- Additive only: four nullable columns, no defaults, no backfill, no rewrite.
-- ADD COLUMN IF NOT EXISTS with no default is a catalog-only change in PostgreSQL 11+.
-- Safe to run more than once. Rollback: 030_rollback_re_units_pf_listing_details.sql
-- =========================================================================
BEGIN;
ALTER TABLE re_units ADD COLUMN IF NOT EXISTS description_ar TEXT NULL;
ALTER TABLE re_units ADD COLUMN IF NOT EXISTS description_en TEXT NULL;
ALTER TABLE re_units ADD COLUMN IF NOT EXISTS bathrooms INTEGER NULL;
ALTER TABLE re_units ADD COLUMN IF NOT EXISTS furnishing VARCHAR(32) NULL;
COMMIT;

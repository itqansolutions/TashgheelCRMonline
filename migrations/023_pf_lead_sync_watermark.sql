-- ============================================================================
-- Migration 023: Property Finder lead polling watermark (additive, non-destructive)
-- Review notes:
--  * Safe to re-run (IF NOT EXISTS everywhere). NOT applied by this review.
--  * deals.source_type/source_id are normally created at runtime by dealsController.ensureDealColumns();
--    they are declared here too so the index below cannot fail on a database where that guard never ran.
--  * The unique index is PARTIAL (source_type = 'property_finder'), so it cannot affect existing deals
--    (none carry that source_type) nor deals from other sources (tasks etc.).
--  * Key is (tenant_id, source_id) where source_id = the EXTERNAL LEAD ID. Seller enquiries that PF
--    expands into several lead IDs (one per agent) therefore each get their own deal: not blocked.
--    It only blocks the same external lead id being turned into two deals in one tenant.
--  * CREATE INDEX (non-concurrent) briefly blocks writes on deals; run in a quiet window.
-- ============================================================================
ALTER TABLE property_finder_settings
    ADD COLUMN IF NOT EXISTS last_lead_sync_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE deals ADD COLUMN IF NOT EXISTS source_type VARCHAR(50);
ALTER TABLE deals ADD COLUMN IF NOT EXISTS source_id VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS uq_deals_pf_lead
    ON deals (tenant_id, source_id)
    WHERE source_type = 'property_finder';

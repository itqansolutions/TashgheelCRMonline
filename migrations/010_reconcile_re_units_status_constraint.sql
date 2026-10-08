-- Migration 010: Reconcile historical Sold units and enforce Real Estate Unit Lifecycle Check Constraint
-- Target Allowed Statuses: Available, Reserved, Contracted, Handed Over, Under Dispute

BEGIN;

-- 1. Evidence-Based Reconciliation of Historical Sold Units
-- Case A: Completed Handover -> Handed Over
UPDATE re_units
SET status = 'Handed Over', updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  SELECT u.id 
  FROM re_units u
  JOIN re_handovers h ON h.unit_id::text = u.id::text AND h.tenant_id::text = u.tenant_id::text
  WHERE LOWER(u.status) = 'sold' AND h.status = 'Handed Over'
);

-- Case B: Active/Signed Contract without completed Handover -> Contracted
UPDATE re_units
SET status = 'Contracted', updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  SELECT u.id 
  FROM re_units u
  JOIN re_contracts c ON c.unit_id::text = u.id::text AND c.tenant_id::text = u.tenant_id::text
  WHERE LOWER(u.status) = 'sold' AND c.status IN ('Signed', 'Active')
);

-- Case C: Unsigned Draft Contract / In-pipeline deal -> Reserved
UPDATE re_units
SET status = 'Reserved', updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  SELECT u.id 
  FROM re_units u
  WHERE LOWER(u.status) = 'sold'
);

-- 2. Drop any previous status check constraint if exists
ALTER TABLE re_units DROP CONSTRAINT IF EXISTS chk_re_units_status;

-- 3. Enforce Strict State Machine Check Constraint on re_units
ALTER TABLE re_units 
ADD CONSTRAINT chk_re_units_status 
CHECK (status IN ('Available', 'Reserved', 'Contracted', 'Handed Over', 'Under Dispute'));

COMMIT;

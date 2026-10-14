-- ============================================================================
-- Migration 021: Add Explicit Item Type Classification (Sales & Quotation Items)
-- Architecture: Phase 2 - Step 1 (Revised)
-- Revisions:
--   1. Fully eliminated category heuristics (verified category is unstandardized).
--   2. Authoritative rule: ONLY products with is_inventory_item = true become 'inventory'.
--   3. ALL historical items with product_id IS NULL or is_inventory_item = false become 'legacy_unclassified'.
--   4. Scoped constraint checks using conrelid = 'table_name'::regclass.
--   5. Enforced NOT NULL in check constraint (item_type IS NOT NULL AND item_type IN (...)).
--   6. Fully idempotent and safe for repeated runs.
-- ============================================================================

BEGIN;

-- 1. Add item_type column if not present (nullable initially to allow safe backfill)
ALTER TABLE sales_order_items 
ADD COLUMN IF NOT EXISTS item_type VARCHAR(30);

ALTER TABLE quotation_items 
ADD COLUMN IF NOT EXISTS item_type VARCHAR(30);

-- 2. Backfill sales_order_items (only untouched rows where item_type IS NULL)
-- A) Authoritative physical inventory items (linked product + is_inventory_item = true)
UPDATE sales_order_items soi
SET item_type = 'inventory'
FROM products p
WHERE soi.product_id = p.id
  AND p.is_inventory_item = true
  AND soi.item_type IS NULL;

-- B) All remaining historical rows (product_id IS NULL or non-inventory) -> legacy_unclassified
UPDATE sales_order_items
SET item_type = 'legacy_unclassified'
WHERE item_type IS NULL;

-- 3. Backfill quotation_items (only untouched rows where item_type IS NULL)
-- A) Authoritative physical inventory items
UPDATE quotation_items qi
SET item_type = 'inventory'
FROM products p
WHERE qi.product_id::text = p.id::text
  AND p.is_inventory_item = true
  AND qi.item_type IS NULL;

-- B) All remaining historical rows -> legacy_unclassified
UPDATE quotation_items
SET item_type = 'legacy_unclassified'
WHERE item_type IS NULL;

-- 4. Add scoped CHECK constraints (strictly scoped by conrelid and disallowing NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'chk_soi_item_type' 
      AND conrelid = 'sales_order_items'::regclass
  ) THEN
    ALTER TABLE sales_order_items
    ADD CONSTRAINT chk_soi_item_type 
    CHECK (item_type IS NOT NULL AND item_type IN ('inventory', 'service', 'non_inventory', 'legacy_unclassified'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'chk_qi_item_type' 
      AND conrelid = 'quotation_items'::regclass
  ) THEN
    ALTER TABLE quotation_items
    ADD CONSTRAINT chk_qi_item_type 
    CHECK (item_type IS NOT NULL AND item_type IN ('inventory', 'service', 'non_inventory', 'legacy_unclassified'));
  END IF;
END $$;

COMMIT;

-- Rollback for 031. Drops the discount columns (and any discount data stored in them).
-- Totals stay net, so amounts owed are unchanged, but the discount breakdown is lost.
BEGIN;
ALTER TABLE quotations   DROP COLUMN IF EXISTS discount_type, DROP COLUMN IF EXISTS discount_value, DROP COLUMN IF EXISTS discount_amount, DROP COLUMN IF EXISTS subtotal_before_discount;
ALTER TABLE sales_orders DROP COLUMN IF EXISTS discount_type, DROP COLUMN IF EXISTS discount_value, DROP COLUMN IF EXISTS discount_amount, DROP COLUMN IF EXISTS subtotal_before_discount;
ALTER TABLE invoices     DROP COLUMN IF EXISTS discount_type, DROP COLUMN IF EXISTS discount_value, DROP COLUMN IF EXISTS discount_amount, DROP COLUMN IF EXISTS subtotal_before_discount;
COMMIT;

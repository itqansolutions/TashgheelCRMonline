// One collection population: invoice payments plus standalone receipt vouchers.
// Invoice-linked vouchers represent their payment, not a second cash movement.
const collectionSource = `(
    SELECT p.id, p.amount, p.payment_method::text, p.payment_date::timestamptz, p.notes::text,
           p.invoice_id::text AS invoice_id, p.tenant_id::text AS tenant_id, p.branch_id::text AS branch_id, p.treasury_account_id,
           p.status::text AS status, NULL::text AS customer_id, 'payment'::text AS source_type,
           NULL::text AS voucher_number
    FROM payments p
    UNION ALL
    SELECT fv.id, fv.amount, fv.payment_method::text, fv.voucher_date::timestamptz,
           fv.notes::text, NULL::text, fv.tenant_id::text, fv.branch_id::text,
           fv.treasury_account_id, fv.status::text, fv.customer_id::text,
           'receipt'::text, fv.voucher_number::text
    FROM finance_vouchers fv
    WHERE fv.voucher_type = 'receipt' AND fv.invoice_id IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM payments linked
          WHERE linked.voucher_id = fv.id
            AND linked.tenant_id::text = fv.tenant_id::text
      )
)`;
module.exports = { collectionSource };

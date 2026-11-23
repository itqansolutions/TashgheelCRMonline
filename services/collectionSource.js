// One collection population: invoice payments plus standalone receipt vouchers.
// Invoice-linked vouchers represent their payment, not a second cash movement.
const collectionSource = `(
    SELECT p.id, p.amount, p.payment_method, p.payment_date, p.notes,
           p.invoice_id, p.tenant_id, p.branch_id, p.treasury_account_id,
           p.status, NULL::text AS customer_id, 'payment'::text AS source_type,
           NULL::text AS voucher_number
    FROM payments p
    UNION ALL
    SELECT fv.id, fv.amount, fv.payment_method, fv.voucher_date::timestamptz,
           fv.notes, NULL::integer, fv.tenant_id, fv.branch_id,
           fv.treasury_account_id, fv.status, fv.customer_id::text,
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

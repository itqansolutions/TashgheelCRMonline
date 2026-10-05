const db = require('../config/db');

/**
 * services/voucherNumbering.js
 * Centralized, concurrency-safe voucher number generator.
 *
 * Concurrency Safety Architecture:
 * 1. Requires a transactional DB client (`client`).
 * 2. Takes a PostgreSQL transaction-scoped advisory lock:
 *    `SELECT pg_advisory_xact_lock(hashtext('voucher:' || $1::text))`
 *    This lock is tenant-scoped, prevents concurrent duplicate numbers across multiple
 *    processes/requests, and is automatically released when the transaction ends (COMMIT or ROLLBACK).
 * 3. Scans the highest sequential number for the prefix.
 * 4. Ensures collision-free sequential generation with defensive existence check.
 */

async function generateVoucherNumber(tenant_id, branch_id, voucher_type, client) {
    if (!client || typeof client.query !== 'function') {
        throw new Error('generateVoucherNumber requires an active transaction client to enforce concurrency locks');
    }

    if (!tenant_id) {
        throw new Error('generateVoucherNumber requires a valid tenant_id');
    }

    const prefix = voucher_type === 'receipt' ? 'RV-' : 'PV-';

    // 1. Transaction-scoped advisory lock per tenant
    await client.query(
        `SELECT pg_advisory_xact_lock(hashtext('voucher:' || $1::text))`,
        [String(tenant_id)]
    );

    // 2. Fetch maximum existing sequential number for this prefix
    let maxSeq = 0;
    try {
        const seqRes = await client.query(
            `SELECT voucher_number FROM finance_vouchers 
             WHERE tenant_id::text = $1::text AND voucher_type = $2 AND voucher_number LIKE $3
             ORDER BY id DESC LIMIT 100`,
            [tenant_id, voucher_type, `${prefix}%`]
        );
        for (const row of seqRes.rows) {
            const numPart = (row.voucher_number || '').slice(prefix.length);
            const parsed = parseInt(numPart, 10);
            if (!isNaN(parsed) && parsed > maxSeq) {
                maxSeq = parsed;
            }
        }
    } catch (e) {
        console.warn('[VoucherNumbering] Sequence lookup notice:', e.message);
    }

    let candidate = maxSeq + 1;
    let voucherNumber = `${prefix}${String(candidate).padStart(4, '0')}`;

    // 3. Collision resistance loop
    let attempts = 0;
    while (attempts < 100) {
        const exists = await client.query(
            `SELECT id FROM finance_vouchers WHERE tenant_id::text = $1::text AND voucher_number = $2 LIMIT 1`,
            [tenant_id, voucherNumber]
        );
        if (exists.rows.length === 0) break;
        candidate++;
        voucherNumber = `${prefix}${String(candidate).padStart(4, '0')}`;
        attempts++;
    }

    return voucherNumber;
}

module.exports = {
    generateVoucherNumber
};

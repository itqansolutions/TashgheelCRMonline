-- Forward-only verification/repair of the schedule-history prerequisite.
-- No rollback is run, no migration marker is deleted, and no existing row is rewritten.
-- Recreate a missing table ONLY for the specific recorded 027 create+rollback state.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('tashgheel:028:schedule-history'));

DO $$
DECLARE
    history_rel regclass := to_regclass('re_installment_schedule_history');
    forward_recorded boolean;
    rollback_recorded boolean;
    incompatible text;
BEGIN
    SELECT EXISTS (SELECT 1 FROM schema_migrations
                   WHERE name = '027_create_re_installment_schedule_history.sql')
      INTO forward_recorded;
    SELECT EXISTS (SELECT 1 FROM schema_migrations
                   WHERE name = '027_rollback_re_installment_schedule_history.sql')
      INTO rollback_recorded;

    IF NOT forward_recorded THEN
        RAISE EXCEPTION 'History prerequisite unverified: 027 forward marker is absent; operator review required.';
    END IF;

    IF history_rel IS NULL THEN
        IF NOT rollback_recorded THEN
            RAISE EXCEPTION 'History table missing without the known 027 rollback marker; operator review required.';
        END IF;

        CREATE TABLE re_installment_schedule_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id VARCHAR(255) NOT NULL,
            branch_id VARCHAR(255),
            contract_id UUID NOT NULL,
            replaced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            replaced_by_user_id VARCHAR(255),
            prior_down_payment NUMERIC(15,2),
            new_down_payment NUMERIC(15,2),
            prior_installments JSONB NOT NULL,
            new_parameters JSONB
        );
        history_rel := to_regclass('re_installment_schedule_history');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = history_rel AND relkind IN ('r', 'p')) THEN
        RAISE EXCEPTION 'History relation is not a table; operator review required.';
    END IF;

    SELECT string_agg(expected.name, ', ' ORDER BY expected.name) INTO incompatible
    FROM (VALUES
        ('id', 'uuid', true),
        ('tenant_id', 'character varying(255)', true),
        ('branch_id', 'character varying(255)', false),
        ('contract_id', 'uuid', true),
        ('replaced_at', 'timestamp with time zone', true),
        ('replaced_by_user_id', 'character varying(255)', false),
        ('prior_down_payment', 'numeric(15,2)', false),
        ('new_down_payment', 'numeric(15,2)', false),
        ('prior_installments', 'jsonb', true),
        ('new_parameters', 'jsonb', false)
    ) AS expected(name, data_type, required)
    LEFT JOIN pg_attribute actual ON actual.attrelid = history_rel
       AND actual.attname = expected.name AND actual.attnum > 0 AND NOT actual.attisdropped
    WHERE actual.attname IS NULL
       OR format_type(actual.atttypid, actual.atttypmod) <> expected.data_type
       OR (expected.required AND NOT actual.attnotnull);

    IF incompatible IS NOT NULL THEN
        RAISE EXCEPTION 'Incompatible history columns (%); no automatic alteration allowed.', incompatible;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c JOIN pg_attribute a
          ON a.attrelid = c.conrelid AND a.attname = 'id'
        WHERE c.conrelid = history_rel AND c.contype = 'p'
          AND c.conkey = ARRAY[a.attnum]::smallint[]
    ) THEN
        RAISE EXCEPTION 'History id primary key missing; no automatic alteration allowed.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = history_rel AND a.attnum > 0 AND NOT a.attisdropped
          AND a.attnotnull AND NOT a.atthasdef AND a.attidentity = '' AND a.attgenerated = ''
          AND a.attname NOT IN ('id', 'tenant_id', 'branch_id', 'contract_id', 'replaced_at',
              'replaced_by_user_id', 'prior_down_payment', 'new_down_payment', 'prior_installments', 'new_parameters')
    ) THEN
        RAISE EXCEPTION 'History has an unsupported required extra column; operator review required.';
    END IF;

    -- Verify insert prerequisites without changing a sequence or creating a test row.
    IF NOT EXISTS (
        SELECT 1 FROM pg_attrdef d JOIN pg_attribute a
          ON a.attrelid = d.adrelid AND a.attnum = d.adnum
        WHERE a.attrelid = history_rel AND a.attname = 'id'
          AND pg_get_expr(d.adbin, d.adrelid) IN ('gen_random_uuid()', 'pg_catalog.gen_random_uuid()')
    ) THEN
        RAISE EXCEPTION 'History id default is incompatible; operator review required.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_attrdef d JOIN pg_attribute a
          ON a.attrelid = d.adrelid AND a.attnum = d.adnum
        WHERE a.attrelid = history_rel AND a.attname = 'replaced_at'
          AND pg_get_expr(d.adbin, d.adrelid) IN ('CURRENT_TIMESTAMP', 'now()', 'transaction_timestamp()')
    ) THEN
        RAISE EXCEPTION 'History timestamp default is incompatible; operator review required.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM re_installment_schedule_history
        WHERE jsonb_typeof(prior_installments) IS DISTINCT FROM 'array'
           OR (new_parameters IS NOT NULL AND jsonb_typeof(new_parameters) IS DISTINCT FROM 'object')
    ) THEN
        RAISE EXCEPTION 'History JSON shape is incompatible; rows preserved for operator review.';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_re_sched_hist_tenant_contract
    ON re_installment_schedule_history (tenant_id, contract_id, replaced_at DESC);
COMMIT;

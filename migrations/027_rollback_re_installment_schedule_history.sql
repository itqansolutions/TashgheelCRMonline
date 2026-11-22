-- Rollback for 027. DESTRUCTIVE: removes preserved schedule history.
-- Guarded: refuses to run while the history table contains any rows.
-- To discard history deliberately, export it first (pg_dump -t re_installment_schedule_history)
-- and then drop the table manually; this script will not do it for you.
BEGIN;
DO $$
BEGIN
    IF to_regclass('re_installment_schedule_history') IS NOT NULL
       AND EXISTS (SELECT 1 FROM re_installment_schedule_history LIMIT 1) THEN
        RAISE EXCEPTION 'Refusing to drop re_installment_schedule_history: it contains preserved schedule history.';
    END IF;
END $$;
DROP TABLE IF EXISTS re_installment_schedule_history;
COMMIT;

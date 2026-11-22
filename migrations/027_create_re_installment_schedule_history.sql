-- 027: History of replaced real estate installment schedules.
-- Written by generateSchedule before an existing schedule is replaced.
-- Forward migration: the application's startup runner may apply it when unrecorded.
-- Review and test on a non-production database before an approved deployment.
BEGIN;

CREATE TABLE IF NOT EXISTS re_installment_schedule_history (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            VARCHAR(255) NOT NULL,   -- same type as re_contracts/re_installments
    branch_id            VARCHAR(255),
    contract_id          UUID NOT NULL,           -- no FK on purpose: history must outlive the contract row
    replaced_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    replaced_by_user_id  VARCHAR(255),
    prior_down_payment   NUMERIC(15,2),
    new_down_payment     NUMERIC(15,2),
    prior_installments   JSONB NOT NULL,
    new_parameters       JSONB
);

CREATE INDEX IF NOT EXISTS idx_re_sched_hist_tenant_contract
    ON re_installment_schedule_history (tenant_id, contract_id, replaced_at DESC);

COMMIT;

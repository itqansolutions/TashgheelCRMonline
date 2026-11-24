-- ISOLATED PROPOSAL ONLY. Requires legacy migration policy and full route tests.
-- The shared server verifier records this digest; never import legacy tokens.
ALTER TABLE whatsapp_phone_claims ADD COLUMN token_sha256 text;
CREATE FUNCTION guard_whatsapp_binding_candidate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE claim whatsapp_phone_claims%ROWTYPE;
BEGIN
  -- Unrelated metadata updates remain possible for retained legacy rows. Any
  -- identity/token replacement, insert or activation needs trusted proof.
  IF TG_OP='UPDATE' AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
    AND NEW.phone_number_id IS NOT DISTINCT FROM OLD.phone_number_id
    AND NEW.access_token IS NOT DISTINCT FROM OLD.access_token
    AND (to_jsonb(NEW)->'branch_id') IS NOT DISTINCT FROM (to_jsonb(OLD)->'branch_id')
    AND (to_jsonb(NEW)->'connection_type') IS NOT DISTINCT FROM (to_jsonb(OLD)->'connection_type')
    AND NOT (NEW.is_active IS TRUE AND OLD.is_active IS DISTINCT FROM TRUE)
  THEN
    IF TG_TABLE_NAME='whatsapp_accounts' THEN
      IF NEW.coexistence_status IS NOT DISTINCT FROM OLD.coexistence_status THEN RETURN NEW; END IF;
    ELSE
      IF NEW.waba_id IS NOT DISTINCT FROM OLD.waba_id THEN RETURN NEW; END IF;
    END IF;
  END IF;
  SELECT * INTO claim FROM whatsapp_phone_claims WHERE phone_number_id=NEW.phone_number_id FOR SHARE;
  IF NOT FOUND OR claim.tenant_id IS DISTINCT FROM NEW.tenant_id OR claim.state NOT IN ('reserved','linked','disconnected')
    OR claim.token_sha256 IS NULL OR claim.token_sha256 IS DISTINCT FROM encode(sha256(convert_to(coalesce(NEW.access_token,''),'UTF8')),'hex')
  THEN RAISE EXCEPTION 'WhatsApp verified ownership binding required' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='whatsapp_settings' THEN
    IF claim.waba_id IS DISTINCT FROM NEW.waba_id THEN
    RAISE EXCEPTION 'WhatsApp WABA binding mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_TABLE_NAME='whatsapp_accounts' THEN
    IF NEW.branch_id IS DISTINCT FROM (SELECT branch_id FROM whatsapp_onboarding_attempts WHERE id=claim.attempt_id) OR NEW.connection_type IS DISTINCT FROM 'coexistence' THEN
      RAISE EXCEPTION 'WhatsApp branch or connection binding changed' USING ERRCODE='23514';
    END IF;
    IF NEW.coexistence_status IS NULL OR NEW.coexistence_status NOT IN ('pending','linked','disconnected') THEN
      RAISE EXCEPTION 'WhatsApp invalid lifecycle status' USING ERRCODE='23514';
    END IF;
    IF NEW.coexistence_status='linked' AND claim.state<>'linked' THEN
      RAISE EXCEPTION 'WhatsApp account status not verified' USING ERRCODE='23514';
    END IF;
    IF NEW.coexistence_status='disconnected' AND claim.state<>'disconnected' THEN
      RAISE EXCEPTION 'WhatsApp disconnect transition required' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.is_active IS TRUE AND claim.state<>'linked' THEN
    RAISE EXCEPTION 'WhatsApp provisioning incomplete' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER whatsapp_accounts_binding_candidate BEFORE INSERT OR UPDATE ON whatsapp_accounts FOR EACH ROW EXECUTE FUNCTION guard_whatsapp_binding_candidate();
CREATE TRIGGER whatsapp_settings_binding_candidate BEFORE INSERT OR UPDATE ON whatsapp_settings FOR EACH ROW EXECUTE FUNCTION guard_whatsapp_binding_candidate();
-- No triggers installed in application database. Does not guard reads/outbound
-- service calls or authorize roles, app verification, lifecycle transitions.

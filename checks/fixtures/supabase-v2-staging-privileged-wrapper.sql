-- STAGING ONLY: move privileged database operations into a non-exposed schema.
-- Public HTTP RPCs are invoker-only wrappers with explicit GRANTs.
CREATE SCHEMA IF NOT EXISTS kaixin_private;
REVOKE ALL ON SCHEMA kaixin_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA kaixin_private TO authenticated;
CREATE OR REPLACE FUNCTION kaixin_private.family_load_v2(p_family_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth AS $$
DECLARE v_payload jsonb; v_revision integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.family_members_v2 m WHERE m.family_id=p_family_id
    AND m.user_id=auth.uid() AND m.revoked_at IS NULL
  ) THEN RETURN jsonb_build_object('ok',false,'error','unauthorized'); END IF;
  SELECT payload, revision INTO v_payload,v_revision FROM public.family_cloud_data_v2
  WHERE family_id=p_family_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','unauthorized'); END IF;
  RETURN jsonb_build_object('ok',true,'exists',true,'revision',v_revision,'payload',v_payload);
END;
$$;

CREATE OR REPLACE FUNCTION kaixin_private.family_save_v2(
  p_family_id uuid, p_payload jsonb, p_expected_revision integer, p_operation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth AS $$
DECLARE v_revision integer; v_old_hash text; v_old_revision integer;
  v_payload_hash text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.family_members_v2 m WHERE m.family_id=p_family_id
    AND m.user_id=auth.uid() AND m.revoked_at IS NULL AND m.member_role='parent'
  ) THEN RETURN jsonb_build_object('ok',false,'error','unauthorized'); END IF;
  IF p_operation_id IS NULL OR p_expected_revision IS NULL OR p_payload IS NULL
    OR jsonb_typeof(p_payload) <> 'object'
    OR jsonb_typeof(p_payload->'homework') <> 'array'
  THEN RETURN jsonb_build_object('ok',false,'error','invalid_request'); END IF;
  IF octet_length(p_payload::text) > 5242880
  THEN RETURN jsonb_build_object('ok',false,'error','payload_too_large'); END IF;
  v_payload_hash := md5(p_payload::text);
  -- Serializes same-family writes, including operation-id replays.
  SELECT revision INTO v_revision FROM public.family_cloud_data_v2
  WHERE family_id=p_family_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','unauthorized'); END IF;
  SELECT payload_hash,revision INTO v_old_hash,v_old_revision
  FROM public.family_operation_receipts_v2
  WHERE family_id=p_family_id AND operation_id=p_operation_id;
  IF FOUND THEN
    IF v_old_hash <> v_payload_hash
    THEN RETURN jsonb_build_object('ok',false,'error','idempotency_key_reused'); END IF;
    RETURN jsonb_build_object('ok',true,'revision',v_old_revision,'duplicate',true);
  END IF;
  IF v_revision <> p_expected_revision
  THEN RETURN jsonb_build_object('ok',false,'error','conflict','revision',v_revision); END IF;
  UPDATE public.family_cloud_data_v2
  SET payload=p_payload,revision=v_revision+1,updated_at=now()
  WHERE family_id=p_family_id RETURNING revision INTO v_revision;
  INSERT INTO public.family_operation_receipts_v2(family_id,operation_id,payload_hash,revision)
  VALUES (p_family_id,p_operation_id,v_payload_hash,v_revision);
  RETURN jsonb_build_object('ok',true,'revision',v_revision,'duplicate',false);
END;
$$;

REVOKE ALL ON FUNCTION kaixin_private.family_load_v2(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION kaixin_private.family_save_v2(uuid,jsonb,integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION kaixin_private.family_load_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION kaixin_private.family_save_v2(uuid,jsonb,integer,uuid) TO authenticated;
-- Change existing published APIs to SECURITY INVOKER; preserve existing signatures/GRANTs.
CREATE OR REPLACE FUNCTION public.family_load_v2(p_family_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,public,kaixin_private
AS $$ SELECT kaixin_private.family_load_v2(p_family_id) $$;
CREATE OR REPLACE FUNCTION public.family_save_v2(
  p_family_id uuid,p_payload jsonb,p_expected_revision integer,p_operation_id uuid
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,public,kaixin_private
AS $$ SELECT kaixin_private.family_save_v2(p_family_id,p_payload,p_expected_revision,p_operation_id) $$;
REVOKE ALL ON FUNCTION public.family_load_v2(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.family_save_v2(uuid,jsonb,integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.family_load_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.family_save_v2(uuid,jsonb,integer,uuid) TO authenticated;

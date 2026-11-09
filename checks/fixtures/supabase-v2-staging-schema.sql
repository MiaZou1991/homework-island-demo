-- STAGING ONLY: Tested on Supabase project kaixin-island-staging (2026-11-09).
-- IMPORTANT: This is a proposed V2 schema, not an authorized production migration.
-- Uses real Supabase auth.uid(). Never override auth.uid or create fake Auth roles.
-- No children's production payload, no real family codes or seeded user accounts.
CREATE TABLE public.family_cloud_data_v2 (
  family_id uuid PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.family_members_v2 (
  family_id uuid NOT NULL REFERENCES public.family_cloud_data_v2(family_id),
  user_id uuid NOT NULL,
  member_role text NOT NULL CHECK (member_role IN ('parent','child')),
  revoked_at timestamptz,
  PRIMARY KEY (family_id,user_id)
);
CREATE TABLE public.family_operation_receipts_v2 (
  family_id uuid NOT NULL REFERENCES public.family_cloud_data_v2(family_id),
  operation_id uuid NOT NULL,
  payload_hash text NOT NULL,
  revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id,operation_id)
);
CREATE TABLE public.kaixin_sync_signal_v2 (
  family_id uuid PRIMARY KEY,
  revision integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.family_cloud_data_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_operation_receipts_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kaixin_sync_signal_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.family_cloud_data_v2,public.family_members_v2,public.family_operation_receipts_v2,public.kaixin_sync_signal_v2 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.kaixin_signal_v2_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.kaixin_sync_signal_v2 (family_id,revision,updated_at)
  VALUES (NEW.family_id, NEW.revision,now())
  ON CONFLICT (family_id) DO UPDATE SET revision=EXCLUDED.revision,updated_at=EXCLUDED.updated_at;
  RETURN NEW;
END;
$$;
CREATE TRIGGER family_v2_changed
AFTER INSERT OR UPDATE OF payload, revision, updated_at ON public.family_cloud_data_v2
FOR EACH ROW EXECUTE FUNCTION public.kaixin_signal_v2_trigger();

CREATE OR REPLACE FUNCTION public.family_load_v2(p_family_id uuid) RETURNS jsonb
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

CREATE OR REPLACE FUNCTION public.family_save_v2(
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
REVOKE ALL ON FUNCTION public.kaixin_signal_v2_trigger() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.family_load_v2(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.family_save_v2(uuid,jsonb,integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.family_load_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.family_save_v2(uuid,jsonb,integer,uuid) TO authenticated;

-- KAIXIN only: isolated staging identity/pairing RPC contract.
-- NEVER APPLY DIRECTLY TO PRODUCTION. Fixed UUID below is the synthetic staging
-- household, not the production household's identifier or a credential.
-- Requires the independently tested V2 tables in kaixin-island-staging.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.family_cloud_data_v2
    WHERE family_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
      AND jsonb_typeof(payload->'homework')='array'
  ) THEN
    RAISE EXCEPTION 'not the approved KAIXIN synthetic staging environment';
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS kaixin_private;
REVOKE ALL ON SCHEMA kaixin_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA kaixin_private TO authenticated;

CREATE TABLE IF NOT EXISTS kaixin_private.child_pairing_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.family_cloud_data_v2(family_id),
  token_hash bytea NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  redeemed_by uuid,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS kaixin_child_invites_expires
  ON kaixin_private.child_pairing_invites (family_id,expires_at)
  WHERE redeemed_at IS NULL;
ALTER TABLE kaixin_private.child_pairing_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON kaixin_private.child_pairing_invites FROM PUBLIC, anon, authenticated;

-- Internal privileged helpers; never expose this schema via PostgREST.
CREATE OR REPLACE FUNCTION kaixin_private.kaixin_identity()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth,kaixin_private AS $$
DECLARE v_role text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'error','unauthorized'); END IF;
  SELECT member_role INTO v_role FROM public.family_members_v2
  WHERE family_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
    AND user_id=auth.uid() AND revoked_at IS NULL;
  IF v_role IS NULL THEN RETURN jsonb_build_object('ok',false,'error','unauthorized'); END IF;
  RETURN jsonb_build_object('ok',true,'family','KAIXIN','role',v_role);
END $$;

CREATE OR REPLACE FUNCTION kaixin_private.kaixin_create_child_invite()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth,extensions,kaixin_private AS $$
DECLARE v_token text; v_expires timestamptz; v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.family_members_v2
    WHERE family_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
      AND user_id=auth.uid() AND member_role='parent' AND revoked_at IS NULL
  ) THEN RETURN jsonb_build_object('ok',false,'error','unauthorized'); END IF;

  -- Serialise two parent devices creating invites at the same time.
  PERFORM 1 FROM public.family_cloud_data_v2
    WHERE family_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid FOR UPDATE;
  UPDATE kaixin_private.child_pairing_invites
    SET expires_at=now()
    WHERE family_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
      AND redeemed_at IS NULL AND expires_at>now();

  v_token=replace(gen_random_uuid()::text,'-','')||
          replace(gen_random_uuid()::text,'-','');
  v_expires=now()+interval '10 minutes';
  INSERT INTO kaixin_private.child_pairing_invites
    (family_id,token_hash,created_by,expires_at)
  VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
          extensions.digest(v_token,'sha256'),auth.uid(),v_expires)
  RETURNING id INTO v_id;
  -- The actual token is shown once. DB stores only SHA-256.
  RETURN jsonb_build_object('ok',true,'token',v_token,'expires_at',v_expires);
END $$;

CREATE OR REPLACE FUNCTION kaixin_private.kaixin_redeem_child_invite(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth,extensions,kaixin_private AS $$
DECLARE v_invite uuid;
BEGIN
  IF auth.uid() IS NULL OR p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$'
  THEN RETURN jsonb_build_object('ok',false,'error','invalid_invite'); END IF;

  -- All device identities join the single KAIXIN household. An identity
  -- already belonging to another active QA family cannot switch families.
  IF EXISTS (
    SELECT 1 FROM public.family_members_v2
    WHERE user_id=auth.uid() AND revoked_at IS NULL
  ) THEN RETURN jsonb_build_object('ok',false,'error','already_bound'); END IF;

  UPDATE kaixin_private.child_pairing_invites
  SET redeemed_by=auth.uid(),redeemed_at=now()
  WHERE family_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
    AND token_hash=extensions.digest(p_token,'sha256')
    AND redeemed_at IS NULL AND expires_at>now()
  RETURNING id INTO v_invite;
  IF v_invite IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_invite'); END IF;

  INSERT INTO public.family_members_v2 (family_id,user_id,member_role,revoked_at)
  VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,auth.uid(),'child',NULL)
  ON CONFLICT (family_id,user_id)
  DO UPDATE SET revoked_at=NULL
  WHERE public.family_members_v2.member_role='child';
  -- No user can convert a parent to child or vice versa using pairing.
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid existing membership state'; END IF;
  RETURN jsonb_build_object('ok',true,'family','KAIXIN','role','child');
END $$;

CREATE OR REPLACE FUNCTION kaixin_private.kaixin_revoke_child_device(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth,kaixin_private AS $$
DECLARE v_revoked uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.family_members_v2
    WHERE family_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
      AND user_id=auth.uid() AND member_role='parent' AND revoked_at IS NULL
  ) THEN RETURN jsonb_build_object('ok',false,'error','unauthorized'); END IF;
  UPDATE public.family_members_v2 SET revoked_at=now()
  WHERE family_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
    AND user_id=p_user_id AND member_role='child' AND revoked_at IS NULL
  RETURNING user_id INTO v_revoked;
  RETURN jsonb_build_object('ok',true,'revoked',v_revoked IS NOT NULL);
END $$;

-- Unexposed SECURITY DEFINER + public SECURITY INVOKER wrappers.
-- A public frontend cannot call kaixin_private functions by REST schema.
CREATE OR REPLACE FUNCTION public.kaixin_identity() RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,kaixin_private
AS $$ SELECT kaixin_private.kaixin_identity() $$;
CREATE OR REPLACE FUNCTION public.kaixin_create_child_invite() RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,kaixin_private
AS $$ SELECT kaixin_private.kaixin_create_child_invite() $$;
CREATE OR REPLACE FUNCTION public.kaixin_redeem_child_invite(p_token text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,kaixin_private
AS $$ SELECT kaixin_private.kaixin_redeem_child_invite(p_token) $$;
CREATE OR REPLACE FUNCTION public.kaixin_revoke_child_device(p_user_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,kaixin_private
AS $$ SELECT kaixin_private.kaixin_revoke_child_device(p_user_id) $$;

REVOKE ALL ON FUNCTION kaixin_private.kaixin_identity() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION kaixin_private.kaixin_create_child_invite() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION kaixin_private.kaixin_redeem_child_invite(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION kaixin_private.kaixin_revoke_child_device(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION kaixin_private.kaixin_identity() TO authenticated;
GRANT EXECUTE ON FUNCTION kaixin_private.kaixin_create_child_invite() TO authenticated;
GRANT EXECUTE ON FUNCTION kaixin_private.kaixin_redeem_child_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION kaixin_private.kaixin_revoke_child_device(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.kaixin_identity() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.kaixin_create_child_invite() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.kaixin_redeem_child_invite(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.kaixin_revoke_child_device(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kaixin_identity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.kaixin_create_child_invite() TO authenticated;
GRANT EXECUTE ON FUNCTION public.kaixin_redeem_child_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kaixin_revoke_child_device(uuid) TO authenticated;

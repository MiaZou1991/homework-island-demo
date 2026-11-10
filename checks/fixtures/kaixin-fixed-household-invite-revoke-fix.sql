-- Staging security hotfix: superseded KAIXIN pairing codes cannot be redeemed.
-- Production database untouched.
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
    AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>now()
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


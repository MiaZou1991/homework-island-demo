-- Pure staging transaction: all test mutations roll back.
-- This checks PostgreSQL authorization and invite rules using synthetic
-- request.jwt.claim.sub. It is NOT a substitute for real Auth JWT HTTP tests.
BEGIN;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.family_cloud_data_v2
  WHERE family_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)
 THEN RAISE EXCEPTION 'staging QA fixture missing'; END IF;
END $$;
INSERT INTO public.family_members_v2(family_id,user_id,member_role,revoked_at)
VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','91111111-1111-4111-8111-111111111111','parent',NULL),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','92222222-2222-4222-8222-222222222222','parent',NULL)
ON CONFLICT (family_id,user_id) DO UPDATE SET revoked_at=NULL;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
 v_parent CONSTANT text='91111111-1111-4111-8111-111111111111';
 v_outsider CONSTANT text='92222222-2222-4222-8222-222222222222';
 v_child CONSTANT text='93333333-3333-4333-8333-333333333333';
 v_second_child CONSTANT text='94444444-4444-4444-8444-444444444444';
 v_invite jsonb; v_new jsonb; v_result jsonb; v_first_token text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',v_outsider,true);
 v_result:=public.kaixin_identity();
 IF v_result->>'error' <> 'unauthorized'
 THEN RAISE EXCEPTION 'outside family identity incorrectly authorized'; END IF;
 v_result:=public.kaixin_create_child_invite();
 IF v_result->>'error' <> 'unauthorized'
 THEN RAISE EXCEPTION 'outside family created a child invite'; END IF;

 PERFORM set_config('request.jwt.claim.sub',v_parent,true);
 v_result:=public.kaixin_identity();
 IF v_result->>'role' <> 'parent' OR v_result->>'family' <> 'KAIXIN'
 THEN RAISE EXCEPTION 'fixed family parent identity not recognized'; END IF;
 v_invite:=public.kaixin_create_child_invite();
 IF v_invite->>'ok' <> 'true' OR length(v_invite->>'token') <> 64
 THEN RAISE EXCEPTION 'random one-time pairing token unavailable'; END IF;
 v_first_token:=v_invite->>'token';
 -- The signed-in caller must NOT be able to query the private token table.
 BEGIN
  PERFORM 1 FROM kaixin_private.child_pairing_invites LIMIT 1;
  RAISE EXCEPTION 'direct pairing-token table read was unexpectedly permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;

 -- A second pairing code cancels the first, including across parent devices.
 v_new:=public.kaixin_create_child_invite();
 IF v_new->>'ok' <> 'true' OR v_new->>'token'=v_first_token
 THEN RAISE EXCEPTION 'new token must supersede previous token'; END IF;

 PERFORM set_config('request.jwt.claim.sub',v_child,true);
 v_result:=public.kaixin_redeem_child_invite(v_first_token);
 IF v_result->>'error' <> 'invalid_invite'
 THEN RAISE EXCEPTION 'previously revoked pairing token still works'; END IF;
 v_result:=public.kaixin_redeem_child_invite(repeat('f',64));
 IF v_result->>'error' <> 'invalid_invite'
 THEN RAISE EXCEPTION 'guessable fake token must fail'; END IF;
 v_result:=public.kaixin_redeem_child_invite(v_new->>'token');
 IF v_result->>'role' <> 'child' OR v_result->>'family' <> 'KAIXIN'
 THEN RAISE EXCEPTION 'new child device failed to join KAIXIN'; END IF;
 v_result:=public.kaixin_identity();
 IF v_result->>'role' <> 'child' THEN RAISE EXCEPTION 'bound child identity not found'; END IF;
 v_result:=public.kaixin_create_child_invite();
 IF v_result->>'error' <> 'unauthorized' THEN RAISE EXCEPTION 'child could create invites'; END IF;
 v_result:=public.kaixin_revoke_child_device(v_parent::uuid);
 IF v_result->>'error' <> 'unauthorized' THEN RAISE EXCEPTION 'child could revoke parent'; END IF;

 PERFORM set_config('request.jwt.claim.sub',v_second_child,true);
 v_result:=public.kaixin_redeem_child_invite(v_new->>'token');
 IF v_result->>'error' <> 'invalid_invite'
 THEN RAISE EXCEPTION 'already redeemed token accepted on second phone'; END IF;

 PERFORM set_config('request.jwt.claim.sub',v_outsider,true);
 v_result:=public.kaixin_redeem_child_invite(repeat('f',64));
 IF v_result->>'error' <> 'already_bound'
 THEN RAISE EXCEPTION 'other household identity not blocked from switching'; END IF;

 PERFORM set_config('request.jwt.claim.sub',v_parent,true);
 v_result:=public.kaixin_revoke_child_device(v_child::uuid);
 IF v_result->>'ok' <> 'true' OR v_result->>'revoked' <> 'true'
 THEN RAISE EXCEPTION 'parent could not unlink child device'; END IF;
 v_result:=public.kaixin_revoke_child_device(v_parent::uuid);
 IF v_result->>'revoked' <> 'false'
 THEN RAISE EXCEPTION 'parent could revoke itself through child-only endpoint'; END IF;
 PERFORM set_config('request.jwt.claim.sub',v_child,true);
 v_result:=public.kaixin_identity();
 IF v_result->>'error' <> 'unauthorized'
 THEN RAISE EXCEPTION 'revoked child still has KAIXIN access'; END IF;
END $$;
SELECT 'PASS: KAIXIN singleton pairing/identity/revoke checks (staging SQL simulation)' AS qa_result;
ROLLBACK;

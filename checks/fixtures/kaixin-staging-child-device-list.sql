-- STAGING ONLY. Exposes the already-bound child devices of the one synthetic
-- KAIXIN family, to allow a parent to revoke a child's device with one click.
-- Absolutely no production data is read; there is no family_id parameter.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.family_cloud_data_v2
   WHERE family_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)
 THEN RAISE EXCEPTION 'isolated staging KAIXIN fixture required'; END IF;
END $$;
CREATE OR REPLACE FUNCTION kaixin_private.kaixin_list_child_devices()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth,kaixin_private AS $$
DECLARE v_items jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.family_members_v2
  WHERE family_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
  AND user_id=auth.uid() AND member_role='parent' AND revoked_at IS NULL
 ) THEN RETURN jsonb_build_object('ok',false,'error','unauthorized'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.user_id)
  ORDER BY m.user_id), '[]'::jsonb)
 INTO v_items
 FROM public.family_members_v2 m
 WHERE m.family_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
 AND m.member_role='child' AND m.revoked_at IS NULL;
 RETURN jsonb_build_object('ok',true,'family','KAIXIN','devices',v_items);
END $$;
CREATE OR REPLACE FUNCTION public.kaixin_list_child_devices()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,kaixin_private
AS $$ SELECT kaixin_private.kaixin_list_child_devices() $$;
REVOKE ALL ON FUNCTION kaixin_private.kaixin_list_child_devices() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION kaixin_private.kaixin_list_child_devices() TO authenticated;
REVOKE ALL ON FUNCTION public.kaixin_list_child_devices() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kaixin_list_child_devices() TO authenticated;

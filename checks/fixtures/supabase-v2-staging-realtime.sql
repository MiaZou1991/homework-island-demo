-- STAGING ONLY. Tested on kaixin-island-staging on 2026-11-09.
-- Do not deploy to production until user approves migration and real Auth/JWT tests pass.
-- Direct table access remains restricted to member self-view and member-scoped signal SELECT.
GRANT SELECT ON public.family_members_v2 TO authenticated;
CREATE POLICY kaixin_v2_member_read_self
ON public.family_members_v2 FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) AND revoked_at IS NULL);

GRANT SELECT ON public.kaixin_sync_signal_v2 TO authenticated;
CREATE POLICY kaixin_v2_signal_read_member
ON public.kaixin_sync_signal_v2 FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.family_members_v2 AS m
    WHERE m.family_id = kaixin_sync_signal_v2.family_id
      AND m.user_id = (SELECT auth.uid())
      AND m.revoked_at IS NULL
  )
);
-- This publishes metadata-only revision changes. Verify realtime JWT subscription separately.
ALTER PUBLICATION supabase_realtime ADD TABLE public.kaixin_sync_signal_v2;

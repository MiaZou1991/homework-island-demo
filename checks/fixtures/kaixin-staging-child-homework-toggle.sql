-- Staging-only: child's restricted, idempotent homework completion toggle.
-- Deliberately no writes to points, rewards, demoGrowth, materials or other records.
create or replace function kaixin_private.kaixin_child_set_homework_done(
  p_homework_id text, p_done boolean, p_expected_done boolean, p_operation_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth,extensions,kaixin_private
as $fn$
declare
 v_family constant uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 v_row public.family_cloud_data_v2%rowtype;
 v_array jsonb; v_item jsonb; v_old_done boolean; v_idx integer;
 v_count integer:=0; v_receipt public.family_operation_receipts_v2%rowtype;
 v_fingerprint text; v_next jsonb; v_new_rev integer;
begin
 if auth.uid() is null or not exists (
    select 1 from public.family_members_v2
    where family_id=v_family and user_id=auth.uid()
      and member_role='child' and revoked_at is null
 ) then return jsonb_build_object('ok',false,'error','unauthorized'); end if;
 if p_homework_id is null or length(p_homework_id) not between 1 and 128
    or p_done is null or p_expected_done is null or p_operation_id is null then
   return jsonb_build_object('ok',false,'error','invalid_request'); end if;
 v_fingerprint=encode(extensions.digest(
   convert_to(jsonb_build_object('id',p_homework_id,'done',p_done,'expected',p_expected_done)::text,'UTF8'),
   'sha256'),'hex');
 select * into v_row from public.family_cloud_data_v2 where family_id=v_family for update;
 if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
 select * into v_receipt from public.family_operation_receipts_v2
   where family_id=v_family and operation_id=p_operation_id;
 if found then
   if v_receipt.payload_hash<>v_fingerprint then
      return jsonb_build_object('ok',false,'error','idempotency_key_reused'); end if;
   return jsonb_build_object('ok',true,'duplicate',true,'revision',v_receipt.revision);
 end if;
 v_array=v_row.payload->'homework';
 if jsonb_typeof(v_array) is distinct from 'array' then
    return jsonb_build_object('ok',false,'error','invalid_payload'); end if;
 if jsonb_array_length(v_array)=0 then return jsonb_build_object('ok',false,'error','not_found_or_duplicate'); end if;
 for v_idx in 0..jsonb_array_length(v_array)-1 loop
   v_item=v_array->v_idx;
   if v_item->>'id'=p_homework_id then
      v_count=v_count+1; v_next=v_item;
   end if;
 end loop;
 if v_count<>1 then return jsonb_build_object('ok',false,'error','not_found_or_duplicate'); end if;
 if coalesce((v_next->>'requireReview')::boolean,false) then
    return jsonb_build_object('ok',false,'error','review_required'); end if;
 v_old_done=coalesce((v_next->>'done')::boolean,false);
 if v_old_done<>p_expected_done then
    return jsonb_build_object('ok',false,'error','conflict','revision',v_row.revision); end if;
 -- A redundant toggle has no side effects, and an ordinary retry with a distinct
 -- id must not accidentally mutate completion timestamp.
 if v_old_done=p_done then
    return jsonb_build_object('ok',false,'error','already_in_state','revision',v_row.revision); end if;
 v_next=jsonb_set(v_next,'{done}',to_jsonb(p_done),true);
 v_next=jsonb_set(v_next,'{completedAt}',
    case when p_done then to_jsonb(clock_timestamp()::text) else 'null'::jsonb end,true);
 v_array=jsonb_set(v_array,array[(select (ordinality-1)::text
    from jsonb_array_elements(v_array) with ordinality as x(value,ordinality)
    where value->>'id'=p_homework_id limit 1)],v_next,false);
 update public.family_cloud_data_v2
    set payload=jsonb_set(v_row.payload,'{homework}',v_array,false),
        revision=revision+1,updated_at=clock_timestamp()
    where family_id=v_family returning revision into v_new_rev;
 insert into public.family_operation_receipts_v2
   (family_id,operation_id,payload_hash,revision)
   values (v_family,p_operation_id,v_fingerprint,v_new_rev);
 return jsonb_build_object('ok',true,'duplicate',false,'revision',v_new_rev,'done',p_done);
end $fn$;
create or replace function public.kaixin_child_set_homework_done(
  p_homework_id text,p_done boolean,p_expected_done boolean,p_operation_id uuid
) returns jsonb language sql security invoker
set search_path=pg_catalog,kaixin_private
as $fn$ select kaixin_private.kaixin_child_set_homework_done(p_homework_id,p_done,p_expected_done,p_operation_id) $fn$;
revoke all on function public.kaixin_child_set_homework_done(text,boolean,boolean,uuid) from public,anon;
grant execute on function public.kaixin_child_set_homework_done(text,boolean,boolean,uuid) to authenticated;
revoke all on function kaixin_private.kaixin_child_set_homework_done(text,boolean,boolean,uuid) from public,anon;
grant execute on function kaixin_private.kaixin_child_set_homework_done(text,boolean,boolean,uuid) to authenticated;

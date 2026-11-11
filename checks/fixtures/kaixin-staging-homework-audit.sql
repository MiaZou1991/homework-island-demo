-- ISOLATED KAIXIN staging only: record the authoritative server-side action
-- time and member role for individual homework changes. No production data.
create table if not exists kaixin_private.kaixin_homework_audit_v2(
  id bigint generated always as identity primary key,
  family_id uuid not null,
  homework_id text not null,
  revision integer not null,
  changed_at timestamptz not null default clock_timestamp(),
  actor_id uuid,
  actor_role text not null,
  action text not null,
  changed_fields jsonb not null
);
create index if not exists kaixin_homework_audit_lookup_v2
 on kaixin_private.kaixin_homework_audit_v2(family_id,homework_id,id desc);
revoke all on kaixin_private.kaixin_homework_audit_v2 from public,anon,authenticated;

create or replace function kaixin_private.log_kaixin_homework_updates_v2()
returns trigger language plpgsql set search_path=pg_catalog,public,auth,kaixin_private
as $fn$
declare
 item jsonb; previous jsonb; field text; fields jsonb; label text; role_label text;
begin
 if new.family_id <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid then return new;end if;
 select member_role into role_label from public.family_members_v2
 where family_id=new.family_id and user_id=auth.uid() and revoked_at is null limit 1;
 for item in select value from jsonb_array_elements(coalesce(new.payload->'homework','[]'::jsonb)) loop
   select value into previous from jsonb_array_elements(coalesce(old.payload->'homework','[]'::jsonb))
     where value->>'id'=item->>'id' limit 1;
   if previous is not distinct from item then continue;end if;
   fields='[]'::jsonb;
   for field in select distinct k from (
      select jsonb_object_keys(coalesce(item,'{}'::jsonb)) as k
      union
      select jsonb_object_keys(coalesce(previous,'{}'::jsonb)) as k
   ) s loop
     if (item->field) is distinct from (previous->field) then
       fields=fields||to_jsonb(field);
     end if;
   end loop;
   label=case when previous is null then '新增作业'
      when previous->>'done' is distinct from item->>'done'
        then case when coalesce((item->>'done')::boolean,false) then '标记作业完成' else '撤销作业完成' end
      else '修改作业' end;
   insert into kaixin_private.kaixin_homework_audit_v2
     (family_id,homework_id,revision,actor_id,actor_role,action,changed_fields)
   values(new.family_id,item->>'id',new.revision,auth.uid(),
     coalesce(role_label,'unknown'),label,fields);
 end loop;
 return new;
end $fn$;
drop trigger if exists kaixin_homework_audit_trigger_v2 on public.family_cloud_data_v2;
create trigger kaixin_homework_audit_trigger_v2
 after update of payload on public.family_cloud_data_v2
 for each row when (old.payload is distinct from new.payload)
 execute function kaixin_private.log_kaixin_homework_updates_v2();

create or replace function kaixin_private.last_kaixin_homework_change_v2(
 p_family_id uuid,p_homework_id text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,auth,kaixin_private
as $fn$
declare audit_row kaixin_private.kaixin_homework_audit_v2%rowtype;
begin
 if auth.uid() is null or not exists(
   select 1 from public.family_members_v2
    where family_id=p_family_id and user_id=auth.uid() and revoked_at is null
 ) then return jsonb_build_object('ok',false,'error','unauthorized');end if;
 select * into audit_row from kaixin_private.kaixin_homework_audit_v2
 where family_id=p_family_id and homework_id=p_homework_id order by id desc limit 1;
 if not found then return jsonb_build_object('ok',true,'exists',false); end if;
 return jsonb_build_object('ok',true,'exists',true,
    'at',audit_row.changed_at,
    'actor',case audit_row.actor_role when 'child' then '孩子'
      when 'parent' then '家长' else '未知设备' end,
    'action',audit_row.action,'fields',audit_row.changed_fields,
    'revision',audit_row.revision);
end $fn$;
create or replace function public.kaixin_homework_last_change_v2(
 p_family_id uuid,p_homework_id text) returns jsonb
 language sql security invoker set search_path=pg_catalog,kaixin_private
as $fn$ select kaixin_private.last_kaixin_homework_change_v2(p_family_id,p_homework_id) $fn$;
revoke all on function public.kaixin_homework_last_change_v2(uuid,text) from public,anon;
grant execute on function public.kaixin_homework_last_change_v2(uuid,text) to authenticated;
revoke all on function kaixin_private.last_kaixin_homework_change_v2(uuid,text) from public,anon;
grant execute on function kaixin_private.last_kaixin_homework_change_v2(uuid,text) to authenticated;

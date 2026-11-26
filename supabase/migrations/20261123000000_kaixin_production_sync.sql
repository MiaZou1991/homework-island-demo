-- Install the private single-family store before switching the web client.
-- Provisioning and import are performed separately through a private channel.
begin;
create schema if not exists kaixin_private;
revoke all on schema kaixin_private from public, anon, authenticated;

create table if not exists kaixin_private.production_state (
  singleton boolean primary key default true check (singleton),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and jsonb_typeof(payload->'homework') is not distinct from 'array'
  ),
  revision bigint not null default 0
);
create table if not exists kaixin_private.production_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('parent', 'child'))
);
revoke all on kaixin_private.production_state, kaixin_private.production_members
  from public, anon, authenticated;

create or replace function public.kaixin_production_load()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object('ok', true, 'role', member.role,
      'revision', state.revision, 'payload', state.payload)
    from kaixin_private.production_members member
    cross join kaixin_private.production_state state
    where member.user_id = auth.uid()
  ), jsonb_build_object('ok', false, 'error', 'unavailable_or_unauthorized'));
$$;

create or replace function public.kaixin_production_save(
  p_expected_revision bigint, p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare saved_revision bigint;
begin
  perform 1 from kaixin_private.production_members
    where user_id = auth.uid() and role = 'parent' for share;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if p_expected_revision is null or p_payload is null
    or jsonb_typeof(p_payload) is distinct from 'object'
    or jsonb_typeof(p_payload->'homework') is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_payload');
  end if;
  update kaixin_private.production_state
    set payload = p_payload, revision = revision + 1
    where singleton and revision = p_expected_revision
    returning revision into saved_revision;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'conflict');
  end if;
  return jsonb_build_object('ok', true, 'revision', saved_revision);
end;
$$;

revoke execute on function public.kaixin_production_load(),
  public.kaixin_production_save(bigint, jsonb) from public, anon;
grant execute on function public.kaixin_production_load(),
  public.kaixin_production_save(bigint, jsonb) to authenticated;
commit;

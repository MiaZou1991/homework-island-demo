begin;
create table kaixin_private.production_device_invites (
  token_hash bytea primary key,
  expires_at timestamptz not null
);
revoke all on kaixin_private.production_device_invites from public, anon, authenticated;

create function public.kaixin_production_create_device_invite()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare token text;
begin
  if not exists (select 1 from kaixin_private.production_members
                 where user_id = auth.uid() and role = 'parent') then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  delete from kaixin_private.production_device_invites where expires_at <= now();
  insert into kaixin_private.production_device_invites values
    (sha256(convert_to(token, 'UTF8')), now() + interval '10 minutes');
  return jsonb_build_object('ok', true, 'token', token);
end;
$$;

create function public.kaixin_production_redeem_device_invite(p_token text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from auth.users where id = auth.uid() and is_anonymous) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_invite');
  end if;
  delete from kaixin_private.production_device_invites
    where token_hash = sha256(convert_to(p_token, 'UTF8')) and expires_at > now();
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_invite');
  end if;
  insert into kaixin_private.production_members(user_id, role) values (auth.uid(), 'child');
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.kaixin_production_create_device_invite(),
  public.kaixin_production_redeem_device_invite(text) from public, anon;
grant execute on function public.kaixin_production_create_device_invite(),
  public.kaixin_production_redeem_device_invite(text) to authenticated;
commit;

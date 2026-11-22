begin;

create or replace function public.kaixin_production_set_homework_done(
  p_homework_id text, p_done boolean, p_expected_done boolean, p_expected_revision bigint
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  current_state kaixin_private.production_state%rowtype;
  task jsonb;
  task_index text;
  matching_tasks integer;
  new_revision bigint;
begin
  perform 1 from kaixin_private.production_members
    where user_id = auth.uid() and role = 'child' for share;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if p_homework_id is null or length(p_homework_id) not between 1 and 128
      or p_done is null or p_expected_done is null or p_expected_revision is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  select * into current_state from kaixin_private.production_state
    where singleton for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;
  select count(*), min((item.ordinality - 1)::text)
    into matching_tasks, task_index
    from jsonb_array_elements(current_state.payload->'homework') with ordinality as item(value, ordinality)
    where item.value->>'id' = p_homework_id;
  if matching_tasks <> 1 then
    return jsonb_build_object('ok', false, 'error', 'not_found_or_duplicate');
  end if;
  task := current_state.payload #> array['homework', task_index];
  if coalesce(task->'requireReview', 'false'::jsonb) <> 'false'::jsonb then
    return jsonb_build_object('ok', false, 'error', 'review_required');
  end if;
  if task->'done' = to_jsonb(p_done) then
    return jsonb_build_object('ok', true, 'revision', current_state.revision);
  end if;
  if current_state.revision <> p_expected_revision
      or coalesce(task->'done', 'false'::jsonb) <> to_jsonb(p_expected_done) then
    return jsonb_build_object('ok', false, 'error', 'conflict');
  end if;

  task := task || jsonb_build_object(
    'done', p_done, 'completedAt', case when p_done then clock_timestamp() else null end
  );
  update kaixin_private.production_state
    set payload = jsonb_set(current_state.payload, array['homework', task_index], task, false),
        revision = current_state.revision + 1
    where singleton returning revision into new_revision;
  return jsonb_build_object('ok', true, 'revision', new_revision);
end;
$$;

revoke execute on function public.kaixin_production_set_homework_done(text, boolean, boolean, bigint)
  from public, anon;
grant execute on function public.kaixin_production_set_homework_done(text, boolean, boolean, bigint)
  to authenticated;
commit;

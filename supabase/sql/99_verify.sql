-- Read-only checks. Run after 01..12. Every row should say PASS.
-- (No table writes, no SET ROLE: an error would abort the whole script in the SQL Editor.)

select 'rls_enabled' as check_name,
  case when (
    select count(*) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('settings', 'staff', 'guests', 'claims', 'winners', 'activity_logs', 'teams')
      and c.relrowsecurity
  ) = 7 then 'PASS' else 'FAIL' end as result,
  'Row level security is enabled on all seven tables' as detail

union all

select 'anon_no_table_select',
  case when not exists (
    select 1 from (values
      ('settings'), ('staff'), ('guests'), ('claims'), ('winners'), ('activity_logs'), ('teams')
    ) t(name)
    where has_table_privilege('anon', format('public.%I', t.name), 'select')
  ) then 'PASS' else 'FAIL' end,
  'anon has no select grant on any table'

union all

select 'token_hidden',
  case when not has_column_privilege('authenticated', 'public.guests', 'token', 'select')
        and not has_column_privilege('authenticated', 'public.guests', 'backup_code', 'select')
  then 'PASS' else 'FAIL' end,
  'authenticated cannot select token or backup_code'

union all

select 'settings_single_row',
  case when (select count(*) from public.settings) = 1 then 'PASS' else 'FAIL' end,
  'settings has exactly one row'

union all

select 'activity_logs_append_only',
  case when exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.activity_logs'::regclass
      and t.tgname = 'activity_logs_no_update_delete'
      and not t.tgisinternal
  ) then 'PASS' else 'FAIL' end,
  'update/delete on activity_logs raised by trigger'

union all

select 'public_settings_readable',
  case when has_function_privilege('anon', 'public.get_public_settings()', 'execute')
  then 'PASS' else 'FAIL' end,
  'anon can execute get_public_settings'

union all

select 'staff_active_not_updatable_by_authenticated',
  case when not has_column_privilege('authenticated', 'public.staff', 'active', 'update')
  then 'PASS' else 'FAIL' end,
  'authenticated cannot update staff.active directly'

union all

select 'get_teams_public',
  case when has_function_privilege('anon', 'public.get_teams()', 'execute')
        and jsonb_array_length(public.get_teams()) = 23
  then 'PASS' else 'FAIL' end,
  'anon can execute get_teams and it returns 23 teams'

union all

select 'register_guest_signatures',
  case when to_regprocedure('public.register_guest_internal(text, uuid)') is not null
        and to_regprocedure('public.register_guest_internal(text)') is null
  then 'PASS' else 'FAIL' end,
  'new (text, uuid) exists; old (text) is gone'

union all

select 'register_guest_internal_service_only',
  case when has_function_privilege('anon', 'public.register_guest_internal(text, uuid)', 'execute')
        or has_function_privilege('authenticated', 'public.register_guest_internal(text, uuid)', 'execute')
        or not has_function_privilege('service_role', 'public.register_guest_internal(text, uuid)', 'execute')
  then 'FAIL' else 'PASS' end,
  'anon and authenticated cannot execute; service_role can'

union all

select 'team_stats_admin_only_static',
  case when not has_function_privilege('anon', 'public.team_stats()', 'execute')
        and position('is_admin' in pg_get_functiondef('public.team_stats()'::regprocedure)) > 0
  then 'PASS' else 'FAIL' end,
  'anon cannot execute team_stats; function checks is_admin';

-- Admin-only RPC totals. Impersonate the first active admin through JWT claims
-- because is_admin() reads auth.uid().
with admin_claims as materialized (
  select
    set_config('request.jwt.claim.sub', s.user_id::text, true) as sub,
    set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', s.user_id, 'role', 'authenticated')::text,
      true
    ) as claims
  from public.staff s
  where s.role = 'admin' and s.active
  order by s.created_at
  limit 1
),
admin_stats as materialized (
  select public.dashboard_stats() as d, public.team_stats() as t
  from admin_claims
)
select 'team_stats_sums' as check_name,
  case
    when a.d is null then 'SKIP'
    when (select coalesce(sum((elem.value->>'registered')::int), 0) from jsonb_array_elements(a.t) as elem(value))
           = (a.d->>'registered')::int
      and (select coalesce(sum((elem.value->>'eligible')::int), 0) from jsonb_array_elements(a.t) as elem(value))
           = (a.d->>'eligible')::int
      and (select coalesce(sum((elem.value->>'cocktail_claimed')::int), 0) from jsonb_array_elements(a.t) as elem(value))
           = (a.d->>'cocktail_claimed')::int
      and (select coalesce(sum((elem.value->>'bundle_claimed')::int), 0) from jsonb_array_elements(a.t) as elem(value))
           = (a.d->>'bundle_claimed')::int
    then 'PASS' else 'FAIL' end as result,
  'team_stats totals equal dashboard_stats' as detail
from (values (1)) v(n)
left join admin_stats a on true;

-- Behavioral check: a non-admin staff JWT must not call team_stats().
do $$
declare
  v_staff uuid;
  v_result text := 'PASS';
begin
  select user_id into v_staff
  from public.staff
  where role = 'staff' and active
  order by created_at
  limit 1;

  if v_staff is null then
    raise notice 'team_stats_non_admin: SKIP (no active non-admin staff)';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_staff::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_staff, 'role', 'authenticated')::text,
    true
  );

  begin
    perform public.team_stats();
    v_result := 'FAIL (non-admin call succeeded)';
  exception
    when insufficient_privilege then
      null;
    when others then
      v_result := 'FAIL (' || sqlerrm || ')';
  end;

  raise notice 'team_stats_non_admin: %', v_result;
end $$;

-- Acceptance checks from the plan, run manually:
--   select public.get_public_settings();
--   set local role anon; select * from public.guests;  -- should error, then rollback

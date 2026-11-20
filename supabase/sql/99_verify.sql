-- Read-only checks. Run after 01..10. Every row should say PASS.
-- (No table writes, no SET ROLE: an error would abort the whole script in the SQL Editor.)

select 'rls_enabled' as check_name,
  case when (
    select count(*) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('settings', 'staff', 'guests', 'claims', 'winners', 'activity_logs')
      and c.relrowsecurity
  ) = 6 then 'PASS' else 'FAIL' end as result,
  'Row level security is enabled on all six tables' as detail

union all

select 'anon_no_table_select',
  case when not exists (
    select 1 from (values
      ('settings'), ('staff'), ('guests'), ('claims'), ('winners'), ('activity_logs')
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
  'anon can execute get_public_settings';

-- Acceptance checks from the plan, run manually:
--   select public.get_public_settings();
--   set local role anon; select * from public.guests;  -- should error, then rollback

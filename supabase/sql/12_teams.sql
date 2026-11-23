-- Teams and sites ------------------------------------------------------------

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 80),
  site text not null check (site in ('Toledo', 'Talisay')),
  sort_order int not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index teams_site_sort_idx on public.teams (site, sort_order);

alter table public.teams enable row level security;
revoke all on public.teams from anon, authenticated;
create policy teams_admin_select on public.teams
  for select to authenticated using (public.is_admin());
grant select on public.teams to authenticated;

alter table public.guests
  add column team_id uuid references public.teams (id) on delete restrict;
create index guests_team_idx on public.guests (team_id);
-- guest_overview is security_invoker, so the new column needs a column grant
grant select (team_id) on public.guests to authenticated;

insert into public.teams (name, site, sort_order) values
  ('ACA CAMPAIGN', 'Toledo', 1),
  ('PHARMA', 'Toledo', 2),
  ('ACA- ELITE', 'Toledo', 3),
  ('MEMBERSHIP PROGRAM', 'Toledo', 4),
  ('ACE- APPOINTMENT SETTERS', 'Toledo', 5),
  ('PSL', 'Toledo', 6),
  ('JACUZZI - CAMP', 'Toledo', 7),
  ('HYBRID RIDE', 'Toledo', 8),
  ('I-MARKETING', 'Toledo', 9),
  ('PRE-Q', 'Toledo', 10),
  ('EPIQ', 'Toledo', 11),
  ('HCP', 'Toledo', 12),
  ('RIFI', 'Toledo', 13),
  ('SPARK - OUTSOURCING', 'Toledo', 14),
  ('DEBT', 'Toledo', 15),
  ('IDENT', 'Toledo', 16),
  ('SPARK VIRTUAL ASSISTANT', 'Toledo', 17),
  ('IT DEPARTMENT', 'Toledo', 18),
  ('TRAINING TEAM', 'Toledo', 19),
  ('MP QC/ QA DEPARTMENT', 'Toledo', 20),
  ('MANAGEMENT / ADMIN TEAM', 'Toledo', 21),
  ('ACA', 'Talisay', 1),
  ('MEMBERSHIP PROGRAM - Talisay', 'Talisay', 2)
on conflict (name) do nothing;

-- Public dropdown data (no table access for anon) ----------------------------

create or replace function public.get_teams()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', t.id, 'name', t.name, 'site', t.site)
      order by case when t.site = 'Toledo' then 1 else 2 end, t.sort_order
    ),
    '[]'::jsonb
  )
  from public.teams t
  where t.active;
$$;

-- Registration now requires a team --------------------------------------------

drop function if exists public.register_guest_internal(text);

create or replace function public.register_guest_internal(p_name text, p_team_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.settings;
  t public.teams;
  v_name text;
  v_norm text;
  v_token text;
  v_code text;
  v_id uuid;
  v_tries int := 0;
begin
  select * into s from public.settings where id = 1;

  if not (s.registration_open and (s.registration_closes_at is null or now() < s.registration_closes_at)) then
    return jsonb_build_object('ok', false, 'code', 'registration_closed', 'message', 'Registration is closed.');
  end if;

  v_name := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');

  if char_length(v_name) < 3
     or char_length(v_name) > 80
     or v_name !~ '^[A-Za-zÀ-ÖØ-öø-ÿ .''-]+$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_name',
      'message', 'Enter your full name (3-80 letters, spaces, . - '' allowed).');
  end if;

  select * into t from public.teams where id = p_team_id and active;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid_team', 'message', 'Select your team.');
  end if;

  v_norm := public.normalize_name(v_name);

  loop
    v_token := public.generate_token();
    v_code := public.generate_backup_code();
    begin
      insert into public.guests (name, name_normalized, token, backup_code, team_id)
      values (v_name, v_norm, v_token, v_code, t.id)
      returning id into v_id;
      exit;
    exception when unique_violation then
      if exists (select 1 from public.guests where name_normalized = v_norm) then
        return jsonb_build_object('ok', false, 'code', 'name_exists',
          'message', 'This name is already registered. Lost your QR? Go to the help desk.');
      end if;
      v_tries := v_tries + 1;
      if v_tries > 5 then
        raise;
      end if;
    end;
  end loop;

  perform public.write_log('register', v_id, v_name, null, null, 'success',
    jsonb_build_object('team', t.name, 'site', t.site));

  return jsonb_build_object('ok', true, 'name', v_name, 'token', v_token,
    'backup_code', v_code, 'team', t.name, 'site', t.site);
end;
$$;

-- Pass shows team and site ------------------------------------------------------

create or replace function public.get_pass(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g public.guests;
  t public.teams;
begin
  select * into g from public.guests where token = lower(btrim(coalesce(p_token, '')));

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select * into t from public.teams where id = g.team_id;

  return jsonb_build_object(
    'ok', true,
    'name', g.name,
    'team', t.name,
    'site', t.site,
    'token', g.token,
    'backup_code', g.backup_code,
    'checked_in', g.checked_in_at is not null,
    'voided', g.voided,
    'cocktail_claimed', exists (select 1 from public.claims c where c.guest_id = g.id and c.station = 'cocktail'),
    'bundle_claimed', exists (select 1 from public.claims c where c.guest_id = g.id and c.station = 'bundle')
  );
end;
$$;

-- Find Guest shows team and site so staff can tell similar names apart ---------

create or replace function public.search_guests(p_query text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  q text := public.normalize_name(p_query);
begin
  if not public.is_active_staff() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if char_length(q) < 3 then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(r))
    from (
      select
        g.id,
        g.name,
        t.name as team,
        t.site as site,
        g.checked_in_at,
        g.voided,
        exists (select 1 from public.claims c where c.guest_id = g.id and c.station = 'cocktail') as cocktail_claimed,
        exists (select 1 from public.claims c where c.guest_id = g.id and c.station = 'bundle') as bundle_claimed
      from public.guests g
      left join public.teams t on t.id = g.team_id
      where strpos(g.name_normalized, q) > 0
      order by g.name
      limit 5
    ) r
  ), '[]'::jsonb);
end;
$$;

-- Admin guest list: new columns are added at the END (required by create or replace view)

create or replace view public.guest_overview with (security_invoker = true) as
select
  g.id,
  g.name,
  g.created_at,
  g.checked_in_at,
  g.checked_in_method,
  g.voided,
  g.void_reason,
  exists (select 1 from public.claims c where c.guest_id = g.id and c.station = 'cocktail') as cocktail_claimed,
  exists (select 1 from public.claims c where c.guest_id = g.id and c.station = 'bundle') as bundle_claimed,
  g.team_id,
  t.name as team,
  t.site as site
from public.guests g
left join public.teams t on t.id = g.team_id;

-- Per-team stats for the dashboard ------------------------------------------------
-- Same definitions as dashboard_stats: registered = all rows, eligible = checked in and not voided,
-- claims exclude voided guests. Per-team rows add up to the overall numbers.

create or replace function public.team_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.site_order, r.sort_order)
    from (
      select
        t.id,
        t.name,
        t.site,
        case when t.site = 'Toledo' then 1 else 2 end as site_order,
        t.sort_order,
        count(g.id) as registered,
        count(g.id) filter (where g.checked_in_at is not null and not g.voided) as eligible,
        count(g.id) filter (where not g.voided and exists (
          select 1 from public.claims c where c.guest_id = g.id and c.station = 'cocktail')) as cocktail_claimed,
        count(g.id) filter (where not g.voided and exists (
          select 1 from public.claims c where c.guest_id = g.id and c.station = 'bundle')) as bundle_claimed
      from public.teams t
      left join public.guests g on g.team_id = t.id
      group by t.id

      union all

      select
        null::uuid,
        'Unassigned'::text,
        'Unassigned'::text,
        3,
        999,
        count(g.id),
        count(g.id) filter (where g.checked_in_at is not null and not g.voided),
        count(g.id) filter (where not g.voided and exists (
          select 1 from public.claims c where c.guest_id = g.id and c.station = 'cocktail')),
        count(g.id) filter (where not g.voided and exists (
          select 1 from public.claims c where c.guest_id = g.id and c.station = 'bundle'))
      from public.guests g
      where g.team_id is null
      having count(g.id) > 0
    ) r
  ), '[]'::jsonb);
end;
$$;

-- Grants (new functions need explicit grants) ---------------------------------------

grant execute on function public.get_teams() to anon, authenticated;
revoke execute on function public.register_guest_internal(text, uuid) from public, anon, authenticated;
grant execute on function public.register_guest_internal(text, uuid) to service_role;
grant execute on function public.get_pass(text) to anon, authenticated;
grant execute on function public.search_guests(text) to authenticated;
grant execute on function public.team_stats() to authenticated;

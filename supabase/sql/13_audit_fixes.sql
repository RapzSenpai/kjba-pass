-- Audit fixes (Pass A findings). Run after 12_teams.sql.
-- Safe to run once; all statements are idempotent.

-- STOP: run this read-only check first. It must return zero rows. If it returns a
-- row, the unique index below fails and this whole file rolls back. Resolve each
-- duplicate manually (void the extra winner in the admin UI) and re-run the check;
-- this file never voids or deletes anything.
--
--   select guest_id, count(*) as active_wins,
--          array_agg(id order by drawn_at) as winner_ids
--   from public.winners
--   where not voided
--   group by guest_id
--   having count(*) > 1;

-- F-07: one active win per guest ------------------------------------------------
create unique index if not exists winners_one_active_idx
  on public.winners (guest_id) where not voided;

create or replace function public.record_winner(p_guest_id uuid, p_prize text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g public.guests;
  v_prize text := btrim(coalesce(p_prize, ''));
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if char_length(v_prize) < 1 or char_length(v_prize) > 120 then
    return jsonb_build_object('ok', false, 'code', 'invalid_prize', 'message', 'Prize must be 1-120 characters.');
  end if;

  -- Serialize concurrent draws for the same guest, then re-check the pool.
  select * into g from public.guests where id = p_guest_id for update;
  if not found or not exists (select 1 from public.raffle_pool where id = p_guest_id) then
    return jsonb_build_object('ok', false, 'code', 'not_in_pool', 'message', 'Guest is not in the raffle pool.');
  end if;

  insert into public.winners (guest_id, prize, drawn_by)
  values (g.id, v_prize, auth.uid())
  on conflict (guest_id) where not voided do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'code', 'already_winner', 'message', 'This guest already has an active win.');
  end if;

  perform public.write_log('record_winner', g.id, g.name, null, 'manual', 'success',
    jsonb_build_object('prize', v_prize, 'winner_id', v_id));
  return jsonb_build_object('ok', true, 'winner_id', v_id);
end;
$$;

-- F-05 + F-06: letter requirement and idempotent registration -------------------
-- One definition only: the (text, uuid, uuid) function below carries the F-05 name
-- check, so no temporary 2-arg overload with default PUBLIC execute is created.
alter table public.guests add column if not exists request_id uuid;
create unique index if not exists guests_request_id_idx
  on public.guests (request_id) where request_id is not null;

drop function if exists public.register_guest_internal(text, uuid);

create or replace function public.register_guest_internal(
  p_name text,
  p_team_id uuid,
  p_request_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.settings;
  t public.teams;
  g public.guests;
  v_name text;
  v_norm text;
  v_token text;
  v_code text;
  v_id uuid;
  v_tries int := 0;
begin
  v_name := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_norm := public.normalize_name(v_name);

  -- Replay: same request id and name returns the pass created by the first attempt.
  -- Checked before registration_open so a retry still works after the cutoff.
  if p_request_id is not null then
    select * into g from public.guests
    where request_id = p_request_id and name_normalized = v_norm;

    if found then
      select * into t from public.teams where id = g.team_id;
      return jsonb_build_object('ok', true, 'name', g.name, 'token', g.token,
        'backup_code', g.backup_code, 'team', t.name, 'site', t.site, 'replay', true);
    end if;
  end if;

  select * into s from public.settings where id = 1;

  if not (s.registration_open and (s.registration_closes_at is null or now() < s.registration_closes_at)) then
    return jsonb_build_object('ok', false, 'code', 'registration_closed', 'message', 'Registration is closed.');
  end if;

  if char_length(v_name) < 3
     or char_length(v_name) > 80
     or v_name !~ '^[A-Za-zÀ-ÖØ-öø-ÿ .''-]+$'
     or v_name !~ '[A-Za-zÀ-ÖØ-öø-ÿ]' then
    return jsonb_build_object('ok', false, 'code', 'invalid_name',
      'message', 'Enter your full name (3-80 letters, spaces, . - '' allowed).');
  end if;

  select * into t from public.teams where id = p_team_id and active;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid_team', 'message', 'Select your team.');
  end if;

  loop
    v_token := public.generate_token();
    v_code := public.generate_backup_code();
    begin
      insert into public.guests (name, name_normalized, token, backup_code, team_id, request_id)
      values (v_name, v_norm, v_token, v_code, t.id, p_request_id)
      returning id into v_id;
      exit;
    exception when unique_violation then
      if p_request_id is not null then
        select * into g from public.guests
        where request_id = p_request_id and name_normalized = v_norm;
        if found then
          select * into t from public.teams where id = g.team_id;
          return jsonb_build_object('ok', true, 'name', g.name, 'token', g.token,
            'backup_code', g.backup_code, 'team', t.name, 'site', t.site, 'replay', true);
        end if;
      end if;

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

revoke all on function public.register_guest_internal(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.register_guest_internal(text, uuid, uuid) to service_role;

-- F-09: log rejected claims at a disabled station ------------------------------
create or replace function public.claim_station(p_identifier text, p_station text, p_method text default 'scan')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.settings;
  g public.guests;
  v_id uuid;
  v_rows int;
  v_at timestamptz;
  v_method text := case when p_method in ('scan', 'code', 'manual') then p_method else 'scan' end;
begin
  if p_station not in ('cocktail', 'bundle') then
    raise exception 'invalid_station' using errcode = '22023';
  end if;
  if not public.can_act_at(p_station) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into s from public.settings where id = 1;

  if (p_station = 'cocktail' and not s.cocktail_enabled)
     or (p_station = 'bundle' and not s.bundle_enabled) then
    perform public.write_log('claim', null, null, p_station, v_method, 'rejected',
      jsonb_build_object('reason', 'station_disabled'));
    return jsonb_build_object('ok', false, 'code', 'station_disabled', 'message', 'This station is turned off.');
  end if;

  v_id := public.resolve_guest(p_identifier);

  if v_id is null then
    perform public.write_log('claim', null, null, p_station, v_method, 'rejected',
      jsonb_build_object('reason', 'not_found'));
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Guest not found.');
  end if;

  select * into g from public.guests where id = v_id;

  if g.voided then
    perform public.write_log('claim', g.id, g.name, p_station, v_method, 'rejected',
      jsonb_build_object('reason', 'voided'));
    return jsonb_build_object('ok', false, 'code', 'voided', 'message', 'This guest is voided.', 'guest_name', g.name);
  end if;

  if g.checked_in_at is null then
    perform public.write_log('claim', g.id, g.name, p_station, v_method, 'rejected',
      jsonb_build_object('reason', 'not_checked_in'));
    return jsonb_build_object('ok', false, 'code', 'not_checked_in',
      'message', 'Not checked in. Send to entrance.', 'guest_name', g.name);
  end if;

  insert into public.claims (guest_id, station, claimed_by, method)
  values (g.id, p_station, auth.uid(), v_method)
  on conflict (guest_id, station) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    select c.claimed_at into v_at from public.claims c where c.guest_id = g.id and c.station = p_station;
    perform public.write_log('claim', g.id, g.name, p_station, v_method, 'already', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'code', 'already_claimed', 'message', 'Already claimed.',
      'guest_name', g.name, 'at', v_at);
  end if;

  perform public.write_log('claim', g.id, g.name, p_station, v_method, 'success', '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'claimed', 'message', 'Claimed.',
    'guest_name', g.name, 'at', now());
end;
$$;

-- F-13: one dashboard request instead of three --------------------------------
create or replace function public.dashboard_snapshot()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'stats', public.dashboard_stats(),
    'teams', public.team_stats(),
    'recent', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from (
        select id, created_at, actor_name, action, guest_name, result
        from public.activity_logs
        order by created_at desc
        limit 30
      ) r
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.dashboard_snapshot() from public, anon, authenticated;
grant execute on function public.dashboard_snapshot() to authenticated;

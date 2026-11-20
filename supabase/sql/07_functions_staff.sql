create or replace function public.check_in_guest(p_identifier text, p_method text default 'scan')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.settings;
  g public.guests;
  v_id uuid;
  v_rows int;
  v_method text := case when p_method in ('scan', 'code', 'manual') then p_method else 'scan' end;
begin
  if not public.can_act_at('entrance') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into s from public.settings where id = 1;
  v_id := public.resolve_guest(p_identifier);

  if v_id is null then
    perform public.write_log('check_in', null, null, 'entrance', v_method, 'rejected',
      jsonb_build_object('reason', 'not_found'));
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Guest not found.');
  end if;

  select * into g from public.guests where id = v_id;

  if g.voided then
    perform public.write_log('check_in', g.id, g.name, 'entrance', v_method, 'rejected',
      jsonb_build_object('reason', 'voided'));
    return jsonb_build_object('ok', false, 'code', 'voided', 'message', 'This guest is voided.', 'guest_name', g.name);
  end if;

  if s.raffle_locked then
    perform public.write_log('check_in', g.id, g.name, 'entrance', v_method, 'rejected',
      jsonb_build_object('reason', 'pool_locked'));
    return jsonb_build_object('ok', false, 'code', 'pool_locked', 'message', 'Raffle pool is locked.', 'guest_name', g.name);
  end if;

  if not public.is_admin()
     and not (s.checkin_open and (s.checkin_closes_at is null or now() < s.checkin_closes_at)) then
    perform public.write_log('check_in', g.id, g.name, 'entrance', v_method, 'rejected',
      jsonb_build_object('reason', 'checkin_closed'));
    return jsonb_build_object('ok', false, 'code', 'checkin_closed', 'message', 'Check-in is closed.', 'guest_name', g.name);
  end if;

  update public.guests
  set checked_in_at = now(), checked_in_by = auth.uid(), checked_in_method = v_method
  where id = v_id and checked_in_at is null and not voided;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    select * into g from public.guests where id = v_id;
    perform public.write_log('check_in', g.id, g.name, 'entrance', v_method, 'already', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'code', 'already_checked_in', 'message', 'Already checked in.',
      'guest_name', g.name, 'at', g.checked_in_at);
  end if;

  perform public.write_log('check_in', g.id, g.name, 'entrance', v_method, 'success', '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'checked_in', 'message', 'Checked in.',
    'guest_name', g.name, 'at', now());
end;
$$;

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

-- Min 3 chars, max 5 results, no secrets returned.
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
        g.checked_in_at,
        g.voided,
        exists (select 1 from public.claims c where c.guest_id = g.id and c.station = 'cocktail') as cocktail_claimed,
        exists (select 1 from public.claims c where c.guest_id = g.id and c.station = 'bundle') as bundle_claimed
      from public.guests g
      where strpos(g.name_normalized, q) > 0
      order by g.name
      limit 5
    ) r
  ), '[]'::jsonb);
end;
$$;

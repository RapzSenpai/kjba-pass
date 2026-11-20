create or replace function public.void_guest(p_guest_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g public.guests;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_reason = '' then
    return jsonb_build_object('ok', false, 'code', 'reason_required', 'message', 'Reason is required.');
  end if;

  update public.guests
  set voided = true, void_reason = v_reason, voided_at = now()
  where id = p_guest_id and not voided
  returning * into g;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Guest not found or already voided.');
  end if;

  perform public.write_log('void_guest', g.id, g.name, null, 'manual', 'success', jsonb_build_object('reason', v_reason));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.restore_guest(p_guest_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g public.guests;
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;

  update public.guests
  set voided = false, void_reason = null, voided_at = null
  where id = p_guest_id and voided
  returning * into g;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Guest not found or not voided.');
  end if;

  perform public.write_log('restore_guest', g.id, g.name, null, 'manual', 'success', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.undo_check_in(p_guest_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g public.guests;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_reason = '' then
    return jsonb_build_object('ok', false, 'code', 'reason_required', 'message', 'Reason is required.');
  end if;

  select * into g from public.guests where id = p_guest_id;
  if not found or g.checked_in_at is null then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Guest not found or not checked in.');
  end if;

  if exists (select 1 from public.claims c where c.guest_id = g.id) then
    return jsonb_build_object('ok', false, 'code', 'has_claims', 'message', 'Undo the claims first.');
  end if;

  if exists (select 1 from public.winners w where w.guest_id = g.id and not w.voided) then
    return jsonb_build_object('ok', false, 'code', 'has_winner', 'message', 'Guest has an active win. Void the win first.');
  end if;

  update public.guests
  set checked_in_at = null, checked_in_by = null, checked_in_method = null
  where id = g.id;

  perform public.write_log('undo_check_in', g.id, g.name, 'entrance', 'manual', 'success', jsonb_build_object('reason', v_reason));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.undo_claim(p_guest_id uuid, p_station text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g public.guests;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_rows int;
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_station not in ('cocktail', 'bundle') then
    raise exception 'invalid_station' using errcode = '22023';
  end if;
  if v_reason = '' then
    return jsonb_build_object('ok', false, 'code', 'reason_required', 'message', 'Reason is required.');
  end if;

  select * into g from public.guests where id = p_guest_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Guest not found.');
  end if;

  delete from public.claims where guest_id = g.id and station = p_station;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'No claim to undo.');
  end if;

  perform public.write_log('undo_claim', g.id, g.name, p_station, 'manual', 'success', jsonb_build_object('reason', v_reason));
  return jsonb_build_object('ok', true);
end;
$$;

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

  if not exists (select 1 from public.raffle_pool where id = p_guest_id) then
    return jsonb_build_object('ok', false, 'code', 'not_in_pool', 'message', 'Guest is not in the raffle pool.');
  end if;

  select * into g from public.guests where id = p_guest_id;

  insert into public.winners (guest_id, prize, drawn_by)
  values (g.id, v_prize, auth.uid())
  returning id into v_id;

  perform public.write_log('record_winner', g.id, g.name, null, 'manual', 'success',
    jsonb_build_object('prize', v_prize, 'winner_id', v_id));
  return jsonb_build_object('ok', true, 'winner_id', v_id);
end;
$$;

-- p_return_to_pool = false: absent winner stays out of the pool (default)
-- p_return_to_pool = true: wrong entry, guest goes back into the pool
create or replace function public.void_winner(p_winner_id uuid, p_reason text, p_return_to_pool boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  w public.winners;
  g public.guests;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_reason = '' then
    return jsonb_build_object('ok', false, 'code', 'reason_required', 'message', 'Reason is required.');
  end if;

  update public.winners
  set voided = true, void_reason = v_reason, voided_at = now(), return_to_pool = coalesce(p_return_to_pool, false)
  where id = p_winner_id and not voided
  returning * into w;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Winner not found or already voided.');
  end if;

  select * into g from public.guests where id = w.guest_id;
  perform public.write_log('void_winner', g.id, g.name, null, 'manual', 'success',
    jsonb_build_object('reason', v_reason, 'prize', w.prize, 'return_to_pool', coalesce(p_return_to_pool, false)));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;

  return (
    select jsonb_build_object(
      'registered', count(*),
      'eligible', count(*) filter (where g.checked_in_at is not null and not g.voided),
      'not_checked_in', count(*) filter (where g.checked_in_at is null and not g.voided),
      'voided', count(*) filter (where g.voided),
      'cocktail_claimed', (
        select count(*) from public.claims c join public.guests gg on gg.id = c.guest_id
        where c.station = 'cocktail' and not gg.voided
      ),
      'bundle_claimed', (
        select count(*) from public.claims c join public.guests gg on gg.id = c.guest_id
        where c.station = 'bundle' and not gg.voided
      ),
      'winners', (select count(*) from public.winners w where not w.voided)
    )
    from public.guests g
  );
end;
$$;

create or replace function public.log_admin_action(p_action text, p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_action not in ('export_guests', 'copy_raffle_names', 'update_settings') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  perform public.write_log(p_action, null, null, null, 'manual', 'success', p_details);
end;
$$;

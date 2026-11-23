-- Audit fixes (Pass A findings). Run after 12_teams.sql.
-- Safe to run once; all statements are idempotent.

-- F-07: one active win per guest ------------------------------------------------
-- Check for existing duplicates first; this index fails if any exist:
--   select guest_id, count(*) from public.winners
--   where not voided group by 1 having count(*) > 1;
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

-- F-05: require at least one letter in guest names ------------------------------
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
     or v_name !~ '^[A-Za-zÀ-ÖØ-öø-ÿ .''-]+$'
     or v_name !~ '[A-Za-zÀ-ÖØ-öø-ÿ]' then
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

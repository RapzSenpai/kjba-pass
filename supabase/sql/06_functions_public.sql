create or replace function public.get_public_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'event_name', event_name,
    'event_date', event_date,
    'venue', venue,
    'timezone', timezone,
    'notice_text', notice_text,
    'registration_open',
      registration_open and (registration_closes_at is null or now() < registration_closes_at),
    'registration_closes_at', registration_closes_at
  )
  from public.settings where id = 1;
$$;

-- Called only by the register-guest Edge Function (service role).
create or replace function public.register_guest_internal(p_name text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.settings;
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

  v_norm := public.normalize_name(v_name);

  loop
    v_token := public.generate_token();
    v_code := public.generate_backup_code();
    begin
      insert into public.guests (name, name_normalized, token, backup_code)
      values (v_name, v_norm, v_token, v_code)
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

  perform public.write_log('register', v_id, v_name, null, null, 'success', '{}'::jsonb);

  return jsonb_build_object('ok', true, 'name', v_name, 'token', v_token, 'backup_code', v_code);
end;
$$;

-- Token is the secret. Returns only that guest's own pass data.
create or replace function public.get_pass(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g public.guests;
begin
  select * into g from public.guests where token = lower(btrim(coalesce(p_token, '')));

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'name', g.name,
    'token', g.token,
    'backup_code', g.backup_code,
    'checked_in', g.checked_in_at is not null,
    'voided', g.voided,
    'cocktail_claimed', exists (select 1 from public.claims c where c.guest_id = g.id and c.station = 'cocktail'),
    'bundle_claimed', exists (select 1 from public.claims c where c.guest_id = g.id and c.station = 'bundle')
  );
end;
$$;

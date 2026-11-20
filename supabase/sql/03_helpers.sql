create or replace function public.is_active_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff s where s.user_id = auth.uid() and s.active
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = auth.uid() and s.active and s.role = 'admin'
  );
$$;

create or replace function public.can_act_at(p_station text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = auth.uid() and s.active
      and (s.role = 'admin' or s.station = p_station)
  );
$$;

create or replace function public.normalize_name(p text)
returns text language sql immutable as $$
  select lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.generate_token()
returns text language sql volatile set search_path = public, extensions as $$
  select encode(gen_random_bytes(10), 'hex');
$$;

-- 6 chars, alphabet without 0 O 1 I L (31 chars)
create or replace function public.generate_backup_code()
returns text language plpgsql volatile set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := gen_random_bytes(6);
  result text := '';
  i int;
begin
  for i in 0..5 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.write_log(
  p_action text,
  p_guest_id uuid,
  p_guest_name text,
  p_station text,
  p_method text,
  p_result text,
  p_details jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_role text;
begin
  select s.full_name, s.role into v_name, v_role
  from public.staff s where s.user_id = auth.uid();

  if auth.uid() is not null then
    update public.staff set last_active_at = now() where user_id = auth.uid();
  end if;

  insert into public.activity_logs
    (actor_id, actor_name, actor_role, action, guest_id, guest_name, station, method, result, details)
  values
    (auth.uid(), coalesce(v_name, 'guest'), coalesce(v_role, 'guest'),
     p_action, p_guest_id, p_guest_name, p_station, p_method, p_result,
     coalesce(p_details, '{}'::jsonb));
end;
$$;

-- identifier can be: guest uuid (manual search result), 6-char backup code, or QR token
create or replace function public.resolve_guest(p_identifier text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  v text := btrim(coalesce(p_identifier, ''));
  v_id uuid;
begin
  if v = '' then
    return null;
  end if;

  if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_id from public.guests where id = v::uuid;
  elsif char_length(v) = 6 then
    select id into v_id from public.guests where backup_code = upper(v);
  else
    select id into v_id from public.guests where token = lower(v);
  end if;

  return v_id;
end;
$$;

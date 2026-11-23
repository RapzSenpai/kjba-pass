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

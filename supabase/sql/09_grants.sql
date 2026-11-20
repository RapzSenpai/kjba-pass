revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant usage on schema public to anon, authenticated;

-- Tables (RLS limits all of these to admins, staff can only read their own staff row)
grant select on public.settings, public.staff, public.claims, public.winners, public.activity_logs to authenticated;
grant select (id, name, name_normalized, created_at, checked_in_at, checked_in_by, checked_in_method, voided, void_reason, voided_at)
  on public.guests to authenticated;
grant update on public.settings to authenticated;
grant update (full_name, station, active) on public.staff to authenticated;
grant select on public.raffle_pool, public.guest_overview to authenticated;

-- Needed because RLS policies call these
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_staff() to authenticated;

-- Public (guests)
grant execute on function public.get_public_settings() to anon, authenticated;
grant execute on function public.get_pass(text) to anon, authenticated;

-- Edge Function only
grant execute on function public.register_guest_internal(text) to service_role;

-- Staff and admin (each function re-checks the role inside)
grant execute on function public.check_in_guest(text, text) to authenticated;
grant execute on function public.claim_station(text, text, text) to authenticated;
grant execute on function public.search_guests(text) to authenticated;

-- Admin (each function re-checks is_admin inside)
grant execute on function public.void_guest(uuid, text) to authenticated;
grant execute on function public.restore_guest(uuid) to authenticated;
grant execute on function public.undo_check_in(uuid, text) to authenticated;
grant execute on function public.undo_claim(uuid, text, text) to authenticated;
grant execute on function public.record_winner(uuid, text) to authenticated;
grant execute on function public.void_winner(uuid, text, boolean) to authenticated;
grant execute on function public.dashboard_stats() to authenticated;
grant execute on function public.log_admin_action(text, jsonb) to authenticated;

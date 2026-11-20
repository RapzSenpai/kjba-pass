alter table public.settings enable row level security;
alter table public.staff enable row level security;
alter table public.guests enable row level security;
alter table public.claims enable row level security;
alter table public.winners enable row level security;
alter table public.activity_logs enable row level security;

-- No policies for anon: anon cannot touch any table directly.

create policy settings_admin_select on public.settings
  for select to authenticated using (public.is_admin());
create policy settings_admin_update on public.settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy staff_self_select on public.staff
  for select to authenticated using (user_id = auth.uid());
create policy staff_admin_select on public.staff
  for select to authenticated using (public.is_admin());
create policy staff_admin_update on public.staff
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy guests_admin_select on public.guests
  for select to authenticated using (public.is_admin());
create policy claims_admin_select on public.claims
  for select to authenticated using (public.is_admin());
create policy winners_admin_select on public.winners
  for select to authenticated using (public.is_admin());
create policy logs_admin_select on public.activity_logs
  for select to authenticated using (public.is_admin());

-- 1. Supabase dashboard > Authentication > Users > Add user (auto-confirm). Copy the user UUID.
-- 2. Replace the values below and run once.
insert into public.staff (user_id, full_name, role, station, active)
values ('ecbcdadf-7bea-46b4-9162-a8a47118262b', 'Admin Name', 'admin', null, true);

-- 1. Create the user in Authentication > Users (auto-confirm). Copy the UUID.
-- 2. station: 'entrance' | 'cocktail' | 'bundle'
insert into public.staff (user_id, full_name, role, station, active)
values ('8f447480-6a06-4699-963d-16a0ac6069f4', 'Staff Name', 'staff', 'entrance', true);

-- Names for the external spin-the-wheel.
-- Excludes unchecked, voided, and guests who already have a winner row,
-- except winners voided with return_to_pool = true (wrong entry).
create or replace view public.raffle_pool with (security_invoker = true) as
select g.id, g.name
from public.guests g
where g.checked_in_at is not null
  and not g.voided
  and not exists (
    select 1 from public.winners w
    where w.guest_id = g.id
      and not (w.voided and w.return_to_pool)
  )
order by g.name;

-- Admin guest list. No token, no backup code.
create or replace view public.guest_overview with (security_invoker = true) as
select
  g.id,
  g.name,
  g.created_at,
  g.checked_in_at,
  g.checked_in_method,
  g.voided,
  g.void_reason,
  exists (select 1 from public.claims c where c.guest_id = g.id and c.station = 'cocktail') as cocktail_claimed,
  exists (select 1 from public.claims c where c.guest_id = g.id and c.station = 'bundle') as bundle_claimed
from public.guests g;

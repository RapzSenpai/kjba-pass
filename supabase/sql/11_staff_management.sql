-- Phase 8: Staff management via Edge Function.
-- Active flag changes now go through manage-staff (which also bans/unbans the Auth user).
-- Never edit 09_grants.sql. This file amends it with a targeted revoke.
revoke update (active) on public.staff from authenticated;

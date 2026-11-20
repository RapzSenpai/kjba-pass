create table public.settings (
  id int primary key default 1 check (id = 1),
  event_name text not null default 'Safelinks Christmas Party',
  event_date date not null default '2026-12-19',
  venue text not null default 'Toledo Megadome Sports Center',
  timezone text not null default 'Asia/Manila',
  notice_text text not null default 'Must be present to win. Absent winners will be voided and redrawn.',
  registration_open boolean not null default false,
  registration_closes_at timestamptz,
  checkin_open boolean not null default false,
  checkin_closes_at timestamptz,
  cocktail_enabled boolean not null default true,
  bundle_enabled boolean not null default true,
  raffle_locked boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin', 'staff')),
  station text check (station in ('entrance', 'cocktail', 'bundle')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_active_at timestamptz,
  constraint staff_station_required check (role = 'admin' or station is not null)
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 80),
  name_normalized text not null unique,
  token text not null unique,
  backup_code text not null unique,
  created_at timestamptz not null default now(),
  checked_in_at timestamptz,
  checked_in_by uuid,
  checked_in_method text check (checked_in_method in ('scan', 'code', 'manual')),
  voided boolean not null default false,
  void_reason text,
  voided_at timestamptz
);
create index guests_checked_in_idx on public.guests (checked_in_at) where checked_in_at is not null;
create index guests_created_idx on public.guests (created_at desc);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests (id) on delete restrict,
  station text not null check (station in ('cocktail', 'bundle')),
  claimed_at timestamptz not null default now(),
  claimed_by uuid,
  method text not null check (method in ('scan', 'code', 'manual')),
  unique (guest_id, station)
);

create table public.winners (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests (id) on delete restrict,
  prize text not null check (char_length(prize) between 1 and 120),
  drawn_at timestamptz not null default now(),
  drawn_by uuid,
  voided boolean not null default false,
  void_reason text,
  voided_at timestamptz,
  return_to_pool boolean not null default false
);
create index winners_guest_idx on public.winners (guest_id);

create table public.activity_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid,
  actor_name text,
  actor_role text,
  action text not null,
  guest_id uuid,
  guest_name text,
  station text,
  method text,
  result text,
  details jsonb not null default '{}'::jsonb
);
create index activity_logs_created_idx on public.activity_logs (created_at desc);

create or replace function public.activity_logs_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'activity_logs is append-only';
end;
$$;

create trigger activity_logs_no_update_delete
before update or delete on public.activity_logs
for each row execute function public.activity_logs_block_mutation();

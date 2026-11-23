# KJBA Pass — Build Plan

Powered by KJBA Production. Event: **Safelinks Christmas Party**, Dec 19, 2026, Toledo Megadome Sports Center. Timezone: `Asia/Manila` (UTC+8, no DST).

---

## 0. Instructions for Cursor (read first)

- Read this whole file before writing any code.
- Work **one phase at a time**. At the end of each phase, stop, summarize what was done, list the acceptance checks, and wait for the owner to say "next phase".
- Never put the Supabase **service role key** in frontend code or in any file committed to git.
- Never `select *` from `guests`. The `token` and `backup_code` columns are not readable by the app roles on purpose.
- All staff/admin writes go through the RPC functions defined in section 6. Do not write directly to tables from the client.
- SQL already applied by the owner is never edited. Fix or change things with a **new numbered SQL file** and log it in `supabase/APPLIED.md`.
- TypeScript strict mode. No `any`. Handle loading, empty, and error states on every screen.
- Show all times in `Asia/Manila` using `Intl.DateTimeFormat` with `timeZone: 'Asia/Manila'`.
- The owner copy-pastes SQL manually into the Supabase SQL Editor. Do not use the Supabase CLI or migrations tooling.

---

## 1. What we are building

A QR-based event system with three user types:

| Role | Access | What they do |
|---|---|---|
| Guest | Public, no login | Register with full name, get a personal QR pass |
| Staff | Login, locked to one station | Scan guest QR at Check-in, Cocktail booth, or Bundle of Joy |
| Admin | Login | Dashboard, guests, staff, raffle, logs, settings |

### Core rules

1. Guest scans the printed event QR, opens `/register`, enters **full name only**, submits.
2. Guest gets a pass at `/g/:token`: big QR, 6-character backup code, notice to take a screenshot, notice "Must be present to win."
3. Every registration is recorded. **Duplicate names are rejected** (normalized: trimmed, collapsed spaces, case-insensitive).
4. Entrance staff scans the pass = **check-in**. Only checked-in guests are **eligible** for the raffle and valid at Cocktail and Bundle of Joy.
5. Unchecked guests stay recorded but are not eligible, and their QR is rejected at the booths.
6. Cocktail and Bundle of Joy each allow **one claim per guest**.
7. Lost QR or broken camera: staff can enter the **backup code** or **search by name** and act manually. All manual actions are logged.
8. Raffle uses an **external spin-the-wheel site**. Admin copies the eligible names, pastes them there, then logs winners manually. Absent winners are voided and redrawn.
9. Admin can void guests, undo mistakes (with a reason), and see an append-only activity log.

### Out of scope

- No custom spin-the-wheel.
- No guest login, no emails, no SMS.
- No realtime subscriptions (polling only).
- No dark mode.

---

## 2. Tech stack

- Vite + React + TypeScript (strict)
- Tailwind CSS + **shadcn/ui** (base) + **Board UI** (selected components)
- React Router, TanStack Query, React Hook Form + Zod
- Supabase (Postgres, Auth, Edge Function) on the free tier
- QR display: `qrcode.react`. QR scanning: `qr-scanner`
- Turnstile: `@marsidev/react-turnstile`
- Icons: `lucide-react`, toasts: `sonner`
- Hosting: Vercel

### Why one Edge Function

Cloudflare Turnstile must be verified server-side. A single Edge Function, `register-guest`, verifies the Turnstile token and then calls the database. Guests cannot call the registration function directly, so they cannot bypass Turnstile.

---

## 3. Folder structure

```
kjba-pass/
├─ plan.md
├─ .env.example
├─ vercel.json
├─ index.html
├─ public/
│  ├─ logo.svg                 # temporary logo, replaced later
│  └─ robots.txt               # Disallow: /
├─ src/
│  ├─ main.tsx
│  ├─ App.tsx
│  ├─ routes.tsx
│  ├─ index.css                # design tokens (section 4)
│  ├─ lib/
│  │  ├─ supabase.ts
│  │  ├─ env.ts                # validates VITE_* vars at startup
│  │  ├─ format.ts             # Manila date/time formatting
│  │  ├─ csv.ts                # CSV export with injection guard + BOM
│  │  └─ qr.ts                 # extract token from scanned text
│  ├─ types/db.ts              # hand-written types for RPC results and views
│  ├─ hooks/
│  │  ├─ useSession.ts
│  │  ├─ useStaffProfile.ts
│  │  └─ usePublicSettings.ts
│  ├─ components/
│  │  ├─ ui/                   # shadcn components
│  │  ├─ board/                # Board UI components (only where used)
│  │  ├─ layout/               # GuestLayout, StaffLayout, AdminLayout
│  │  └─ common/               # Logo, StatusBadge, ResultCard, EmptyState, ConfirmDialog
│  └─ features/
│     ├─ register/
│     ├─ pass/
│     ├─ auth/                 # LoginPage, RequireRole
│     ├─ scanner/
│     └─ admin/
│        ├─ dashboard/
│        ├─ guests/
│        ├─ staff/
│        ├─ raffle/
│        ├─ logs/
│        └─ settings/
└─ supabase/
   ├─ README.md                # table list, run order, how to apply
   ├─ APPLIED.md               # checklist: which SQL file was applied and when
   ├─ sql/
   │  ├─ 01_extensions.sql
   │  ├─ 02_tables.sql
   │  ├─ 03_helpers.sql
   │  ├─ 04_views.sql
   │  ├─ 05_rls.sql
   │  ├─ 06_functions_public.sql
   │  ├─ 07_functions_staff.sql
   │  ├─ 08_functions_admin.sql
   │  ├─ 09_grants.sql
   │  ├─ 10_seed.sql
   │  └─ 99_verify.sql
   ├─ templates/
   │  ├─ create_admin.sql      # NOT part of the run order, owner edits and runs once
   │  └─ add_staff.sql         # NOT part of the run order
   └─ functions/
      └─ register-guest/index.ts
```

---

## 4. Design system

Light mode only. Modern, clean, high contrast. White surfaces, near-black components, color only where it carries meaning.

### Tokens (put in `src/index.css`, shadcn variable names)

| Token | Value | Use |
|---|---|---|
| `--background` | `#FFFFFF` | page background |
| `--foreground` | `#0A0A0A` | text |
| `--card` | `#FFFFFF` | cards |
| `--muted` | `#F5F5F5` | subtle surfaces, table headers |
| `--muted-foreground` | `#737373` | secondary text |
| `--border` | `#E5E5E5` | borders, dividers |
| `--input` | `#E5E5E5` | input borders |
| `--primary` | `#0A0A0A` | buttons, active nav |
| `--primary-foreground` | `#FAFAFA` | text on primary |
| `--ring` | `#0A0A0A` | focus ring |
| `--radius` | `0.625rem` | corners |

### Status colors (semantic only)

| Meaning | Solid | Soft background | Text |
|---|---|---|---|
| Success (claimed, checked in) | `#16A34A` | `#DCFCE7` | `#166534` |
| Stop (already used, voided, not found, closed) | `#DC2626` | `#FEE2E2` | `#991B1B` |
| Needs action (not checked in) | `#D97706` | `#FEF3C7` | `#92400E` |

### Station colors (badges and scanner header only)

- Check-in: `#2563EB`
- Cocktail: `#9333EA`
- Bundle of Joy: `#0D9488`

### Typography and spacing

- Font: Inter (`@fontsource-variable/inter`).
- Base size 16px. Inputs are at least 16px so iOS does not zoom on focus.
- Touch targets at least 44px high.
- Logo top-left on every layout. Temporary `public/logo.svg` until the client logo arrives. Logo component accepts the file path from one constant so swapping is a one-line change.

### Libraries

1. Run `npx shadcn@latest init -t vite` first. shadcn is the base and the source of truth for tokens.
2. Run `npx boardui@latest init` second. Read its docs and output before using it. Use Board UI only for components where it adds clear value. Put them in `src/components/board/`.
3. If Board UI overrides shadcn CSS variables or restyles shadcn components, revert those changes. The tokens above win.

### Mobile first

- Guest pages and scanner: designed for 360px width first.
- Admin: works on phone, optimized for desktop. Tables become stacked cards below 768px.
- Respect safe areas (`env(safe-area-inset-*)`).
- The QR is always black on white with a visible white quiet zone, regardless of theme.

---

## 5. Routes

| Path | Access | Page |
|---|---|---|
| `/` | public | redirect to `/register` |
| `/register` | public | registration form |
| `/g/:token` | public (token is the secret) | guest pass |
| `/login` | public, not linked anywhere | staff and admin login |
| `/scan` | staff, admin | scanner, locked to the staff station |
| `/admin` | admin | dashboard |
| `/admin/guests` | admin | guests list |
| `/admin/staff` | admin | staff list |
| `/admin/raffle` | admin | raffle pool and winners |
| `/admin/logs` | admin | activity logs |
| `/admin/settings` | admin | event settings |

`RequireRole` guard: no session goes to `/login`, wrong role goes to the correct home (`staff` to `/scan`, `admin` to `/admin`). The guard is only UX. Real protection is RLS and RPC checks.

---

## 6. Database

Run files in order in the Supabase SQL Editor. Cursor creates each file with the exact content below, then asks the owner to run them and tick `supabase/APPLIED.md`.

### Tables overview

| Table | Purpose |
|---|---|
| `settings` | single row: event info, registration/check-in windows, station switches |
| `staff` | staff and admin accounts, role and station, active flag |
| `guests` | registered guests, token, backup code, check-in, void |
| `claims` | one row per guest per station (cocktail, bundle) |
| `winners` | raffle winners log |
| `activity_logs` | append-only audit trail |

Views: `raffle_pool` (eligible names for the wheel), `guest_overview` (admin guest list with claim flags, no secrets).

### 01_extensions.sql

```sql
create extension if not exists pgcrypto with schema extensions;
```

### 02_tables.sql

```sql
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
```

### 03_helpers.sql

```sql
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
```

### 04_views.sql

```sql
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
```

### 05_rls.sql

```sql
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
```

### 06_functions_public.sql

```sql
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
```

### 07_functions_staff.sql

Return shape for `check_in_guest` and `claim_station`: `{ ok, code, message, guest_name?, at? }`. `ok = true` only on a fresh success. Other outcomes return `ok = false` with a `code` the UI maps to a color.

```sql
create or replace function public.check_in_guest(p_identifier text, p_method text default 'scan')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.settings;
  g public.guests;
  v_id uuid;
  v_rows int;
  v_method text := case when p_method in ('scan', 'code', 'manual') then p_method else 'scan' end;
begin
  if not public.can_act_at('entrance') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into s from public.settings where id = 1;
  v_id := public.resolve_guest(p_identifier);

  if v_id is null then
    perform public.write_log('check_in', null, null, 'entrance', v_method, 'rejected',
      jsonb_build_object('reason', 'not_found'));
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Guest not found.');
  end if;

  select * into g from public.guests where id = v_id;

  if g.voided then
    perform public.write_log('check_in', g.id, g.name, 'entrance', v_method, 'rejected',
      jsonb_build_object('reason', 'voided'));
    return jsonb_build_object('ok', false, 'code', 'voided', 'message', 'This guest is voided.', 'guest_name', g.name);
  end if;

  if s.raffle_locked then
    perform public.write_log('check_in', g.id, g.name, 'entrance', v_method, 'rejected',
      jsonb_build_object('reason', 'pool_locked'));
    return jsonb_build_object('ok', false, 'code', 'pool_locked', 'message', 'Raffle pool is locked.', 'guest_name', g.name);
  end if;

  if not public.is_admin()
     and not (s.checkin_open and (s.checkin_closes_at is null or now() < s.checkin_closes_at)) then
    perform public.write_log('check_in', g.id, g.name, 'entrance', v_method, 'rejected',
      jsonb_build_object('reason', 'checkin_closed'));
    return jsonb_build_object('ok', false, 'code', 'checkin_closed', 'message', 'Check-in is closed.', 'guest_name', g.name);
  end if;

  update public.guests
  set checked_in_at = now(), checked_in_by = auth.uid(), checked_in_method = v_method
  where id = v_id and checked_in_at is null and not voided;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    select * into g from public.guests where id = v_id;
    perform public.write_log('check_in', g.id, g.name, 'entrance', v_method, 'already', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'code', 'already_checked_in', 'message', 'Already checked in.',
      'guest_name', g.name, 'at', g.checked_in_at);
  end if;

  perform public.write_log('check_in', g.id, g.name, 'entrance', v_method, 'success', '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'checked_in', 'message', 'Checked in.',
    'guest_name', g.name, 'at', now());
end;
$$;

create or replace function public.claim_station(p_identifier text, p_station text, p_method text default 'scan')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.settings;
  g public.guests;
  v_id uuid;
  v_rows int;
  v_at timestamptz;
  v_method text := case when p_method in ('scan', 'code', 'manual') then p_method else 'scan' end;
begin
  if p_station not in ('cocktail', 'bundle') then
    raise exception 'invalid_station' using errcode = '22023';
  end if;
  if not public.can_act_at(p_station) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into s from public.settings where id = 1;

  if (p_station = 'cocktail' and not s.cocktail_enabled)
     or (p_station = 'bundle' and not s.bundle_enabled) then
    return jsonb_build_object('ok', false, 'code', 'station_disabled', 'message', 'This station is turned off.');
  end if;

  v_id := public.resolve_guest(p_identifier);

  if v_id is null then
    perform public.write_log('claim', null, null, p_station, v_method, 'rejected',
      jsonb_build_object('reason', 'not_found'));
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Guest not found.');
  end if;

  select * into g from public.guests where id = v_id;

  if g.voided then
    perform public.write_log('claim', g.id, g.name, p_station, v_method, 'rejected',
      jsonb_build_object('reason', 'voided'));
    return jsonb_build_object('ok', false, 'code', 'voided', 'message', 'This guest is voided.', 'guest_name', g.name);
  end if;

  if g.checked_in_at is null then
    perform public.write_log('claim', g.id, g.name, p_station, v_method, 'rejected',
      jsonb_build_object('reason', 'not_checked_in'));
    return jsonb_build_object('ok', false, 'code', 'not_checked_in',
      'message', 'Not checked in. Send to entrance.', 'guest_name', g.name);
  end if;

  insert into public.claims (guest_id, station, claimed_by, method)
  values (g.id, p_station, auth.uid(), v_method)
  on conflict (guest_id, station) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    select c.claimed_at into v_at from public.claims c where c.guest_id = g.id and c.station = p_station;
    perform public.write_log('claim', g.id, g.name, p_station, v_method, 'already', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'code', 'already_claimed', 'message', 'Already claimed.',
      'guest_name', g.name, 'at', v_at);
  end if;

  perform public.write_log('claim', g.id, g.name, p_station, v_method, 'success', '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'claimed', 'message', 'Claimed.',
    'guest_name', g.name, 'at', now());
end;
$$;

-- Min 3 chars, max 5 results, no secrets returned.
create or replace function public.search_guests(p_query text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  q text := public.normalize_name(p_query);
begin
  if not public.is_active_staff() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if char_length(q) < 3 then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(r))
    from (
      select
        g.id,
        g.name,
        g.checked_in_at,
        g.voided,
        exists (select 1 from public.claims c where c.guest_id = g.id and c.station = 'cocktail') as cocktail_claimed,
        exists (select 1 from public.claims c where c.guest_id = g.id and c.station = 'bundle') as bundle_claimed
      from public.guests g
      where strpos(g.name_normalized, q) > 0
      order by g.name
      limit 5
    ) r
  ), '[]'::jsonb);
end;
$$;
```

### 08_functions_admin.sql

All functions require `is_admin()` and raise `42501` otherwise. All return `{ ok, code?, message? }`.

```sql
create or replace function public.void_guest(p_guest_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g public.guests;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_reason = '' then
    return jsonb_build_object('ok', false, 'code', 'reason_required', 'message', 'Reason is required.');
  end if;

  update public.guests
  set voided = true, void_reason = v_reason, voided_at = now()
  where id = p_guest_id and not voided
  returning * into g;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Guest not found or already voided.');
  end if;

  perform public.write_log('void_guest', g.id, g.name, null, 'manual', 'success', jsonb_build_object('reason', v_reason));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.restore_guest(p_guest_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g public.guests;
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;

  update public.guests
  set voided = false, void_reason = null, voided_at = null
  where id = p_guest_id and voided
  returning * into g;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Guest not found or not voided.');
  end if;

  perform public.write_log('restore_guest', g.id, g.name, null, 'manual', 'success', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.undo_check_in(p_guest_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g public.guests;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_reason = '' then
    return jsonb_build_object('ok', false, 'code', 'reason_required', 'message', 'Reason is required.');
  end if;

  select * into g from public.guests where id = p_guest_id;
  if not found or g.checked_in_at is null then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Guest not found or not checked in.');
  end if;

  if exists (select 1 from public.claims c where c.guest_id = g.id) then
    return jsonb_build_object('ok', false, 'code', 'has_claims', 'message', 'Undo the claims first.');
  end if;

  if exists (select 1 from public.winners w where w.guest_id = g.id and not w.voided) then
    return jsonb_build_object('ok', false, 'code', 'has_winner', 'message', 'Guest has an active win. Void the win first.');
  end if;

  update public.guests
  set checked_in_at = null, checked_in_by = null, checked_in_method = null
  where id = g.id;

  perform public.write_log('undo_check_in', g.id, g.name, 'entrance', 'manual', 'success', jsonb_build_object('reason', v_reason));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.undo_claim(p_guest_id uuid, p_station text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g public.guests;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_rows int;
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_station not in ('cocktail', 'bundle') then
    raise exception 'invalid_station' using errcode = '22023';
  end if;
  if v_reason = '' then
    return jsonb_build_object('ok', false, 'code', 'reason_required', 'message', 'Reason is required.');
  end if;

  select * into g from public.guests where id = p_guest_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Guest not found.');
  end if;

  delete from public.claims where guest_id = g.id and station = p_station;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'No claim to undo.');
  end if;

  perform public.write_log('undo_claim', g.id, g.name, p_station, 'manual', 'success', jsonb_build_object('reason', v_reason));
  return jsonb_build_object('ok', true);
end;
$$;

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

  if not exists (select 1 from public.raffle_pool where id = p_guest_id) then
    return jsonb_build_object('ok', false, 'code', 'not_in_pool', 'message', 'Guest is not in the raffle pool.');
  end if;

  select * into g from public.guests where id = p_guest_id;

  insert into public.winners (guest_id, prize, drawn_by)
  values (g.id, v_prize, auth.uid())
  returning id into v_id;

  perform public.write_log('record_winner', g.id, g.name, null, 'manual', 'success',
    jsonb_build_object('prize', v_prize, 'winner_id', v_id));
  return jsonb_build_object('ok', true, 'winner_id', v_id);
end;
$$;

-- p_return_to_pool = false: absent winner stays out of the pool (default)
-- p_return_to_pool = true: wrong entry, guest goes back into the pool
create or replace function public.void_winner(p_winner_id uuid, p_reason text, p_return_to_pool boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  w public.winners;
  g public.guests;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_reason = '' then
    return jsonb_build_object('ok', false, 'code', 'reason_required', 'message', 'Reason is required.');
  end if;

  update public.winners
  set voided = true, void_reason = v_reason, voided_at = now(), return_to_pool = coalesce(p_return_to_pool, false)
  where id = p_winner_id and not voided
  returning * into w;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Winner not found or already voided.');
  end if;

  select * into g from public.guests where id = w.guest_id;
  perform public.write_log('void_winner', g.id, g.name, null, 'manual', 'success',
    jsonb_build_object('reason', v_reason, 'prize', w.prize, 'return_to_pool', coalesce(p_return_to_pool, false)));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;

  return (
    select jsonb_build_object(
      'registered', count(*),
      'eligible', count(*) filter (where g.checked_in_at is not null and not g.voided),
      'not_checked_in', count(*) filter (where g.checked_in_at is null and not g.voided),
      'voided', count(*) filter (where g.voided),
      'cocktail_claimed', (
        select count(*) from public.claims c join public.guests gg on gg.id = c.guest_id
        where c.station = 'cocktail' and not gg.voided
      ),
      'bundle_claimed', (
        select count(*) from public.claims c join public.guests gg on gg.id = c.guest_id
        where c.station = 'bundle' and not gg.voided
      ),
      'winners', (select count(*) from public.winners w where not w.voided)
    )
    from public.guests g
  );
end;
$$;

create or replace function public.log_admin_action(p_action text, p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_action not in ('export_guests', 'copy_raffle_names', 'update_settings') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  perform public.write_log(p_action, null, null, null, 'manual', 'success', p_details);
end;
$$;
```

### 09_grants.sql

```sql
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
```

Note: when a new function is added later, re-run the relevant `grant execute` line in a new numbered file.

### 10_seed.sql

```sql
insert into public.settings (id) values (1) on conflict (id) do nothing;
```

### 99_verify.sql

Cursor writes read-only checks the owner runs after applying all files:

- All six tables have `relrowsecurity = true`.
- `select * from public.guests` as `anon` is denied (test with `set local role anon;`).
- `select token from public.guests` as `authenticated` is denied.
- `public.settings` has exactly one row.
- `activity_logs` update and delete raise `activity_logs is append-only`.

### templates/create_admin.sql (not in run order)

```sql
-- 1. Supabase dashboard > Authentication > Users > Add user (auto-confirm). Copy the user UUID.
-- 2. Replace the values below and run once.
insert into public.staff (user_id, full_name, role, station, active)
values ('00000000-0000-0000-0000-000000000000', 'Admin Name', 'admin', null, true);
```

### templates/add_staff.sql (not in run order)

```sql
-- 1. Create the user in Authentication > Users (auto-confirm). Copy the UUID.
-- 2. station: 'entrance' | 'cocktail' | 'bundle'
insert into public.staff (user_id, full_name, role, station, active)
values ('00000000-0000-0000-0000-000000000000', 'Staff Name', 'staff', 'entrance', true);
```

### supabase/README.md must contain

- Table list with one-line purpose (copy from the overview above).
- Run order and what each file does.
- How to apply: Supabase dashboard > SQL Editor > paste file > Run.
- Auth setup: turn **off** public sign-ups in Authentication settings. Create users manually.
- Edge Function deploy steps and secrets (section 7).

### supabase/APPLIED.md

A checklist table: file, applied (yes/no), date, notes. Cursor updates it whenever a SQL file is added.

---

## 7. Edge Function: `register-guest`

File: `supabase/functions/register-guest/index.ts`. Deploy by pasting into the Supabase dashboard Edge Functions editor (keep JWT verification on, the client calls it with `supabase.functions.invoke`).

Secrets to set in the dashboard: `TURNSTILE_SECRET_KEY`, `ALLOWED_ORIGIN` (the Vercel domain, no trailing slash). `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

Behavior:

1. Handle `OPTIONS` (CORS) and only allow `POST`.
2. CORS: allow only `ALLOWED_ORIGIN`. During local dev also allow `http://localhost:5173` when `ALLOWED_ORIGIN` includes it (comma-separated list).
3. Parse `{ name, turnstileToken }`. Reject non-strings and names longer than 200 chars.
4. Verify the token: `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` with `secret`, `response`, and `remoteip` (first value of `x-forwarded-for`). If `success` is false return `{ ok: false, code: 'turnstile_failed', message: 'Verification failed. Try again.' }` with status 400.
5. Create a Supabase client with the service role key and call `rpc('register_guest_internal', { p_name: name })`.
6. Return the RPC JSON as-is. Status 200 for `ok: true`, 400 for validation errors, 409 for `name_exists`, 403 for `registration_closed`.
7. Never log the token or the full body.

Turnstile dev keys (Cloudflare test keys, always pass):

- Site key: `1x00000000000000000000AA`
- Secret key: `1x0000000000000000000000000000000AA`

Use real keys in production.

---

## 8. Environment

`.env.example`:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_TURNSTILE_SITE_KEY=
```

`src/lib/env.ts` throws a clear error at startup if any is missing. Only the anon (publishable) key is allowed in the frontend.

`.gitignore` must include `.env`, `.env.local`.

---

## 9. Screens

### 9.1 Register (`/register`)

- Header with logo, event name, date, venue (from `get_public_settings`).
- One field: **Full name**. Zod: trim, 3-80 chars, letters/spaces/`.`/`-`/`'`.
- Required checkbox: "I understand I must be present to win raffle prizes."
- Turnstile widget. Submit disabled until the checkbox is ticked and Turnstile passes.
- If registration is closed: show a "Registration is closed" card, no form.
- If `localStorage['kjba_pass_token']` exists: show a banner "You already registered on this device. View my pass" with a link. Do not auto-redirect (people may share a phone).
- Error mapping: `name_exists` shows the server message, `registration_closed`, `invalid_name`, `turnstile_failed` show inline errors.
- On success: save token to `localStorage['kjba_pass_token']` (in try/catch), navigate to `/g/:token`.
- Keep the page tiny: no hero images, one font file. 300 phones will load this at once.

### 9.2 Guest pass (`/g/:token`)

- Calls `get_pass`. Not found shows "Pass not found. Go to the help desk."
- Guest name large.
- QR (`QRCodeSVG`, level `M`, at least 280px, black on white, quiet zone) encoding the **raw token** only.
- Backup code in large monospace under the QR.
- Notice cards:
  - "Take a screenshot of this page. Lost it? Go to the help desk."
  - Event notice text from settings ("Must be present to win...").
  - If not checked in: amber "Show this QR at the entrance to qualify for the raffle and booths."
- Status list with check marks: Checked in, Cocktail, Bundle of Joy.
- If voided: red "This pass is voided. Go to the help desk."
- Refetch on window focus and a manual Refresh button. No interval polling.
- Hint to raise screen brightness.

### 9.3 Login (`/login`)

- Email + password via Supabase Auth. No link to this page anywhere in guest UI.
- After login read the `staff` row (own row via RLS). If missing or inactive: sign out and show "Account not active."
- Redirect: admin to `/admin`, staff to `/scan`.
- Persist session, logout button in both layouts.

### 9.4 Scanner (`/scan`)

- Station badge at the top, big and colored: `CHECK-IN`, `COCKTAIL`, `BUNDLE OF JOY`. Staff are locked to `staff.station`. Admin can switch station with a selector.
- Three tabs, always visible: **Scan QR** | **Enter Code** | **Find Guest**. Remember the last used tab per device in `localStorage`.
- **Scan QR**: `qr-scanner`, rear camera, full-width viewfinder. Torch toggle if supported. If the scanned text contains `/`, use the last segment. After a scan, pause scanning for about 2.5s while the result shows. Ignore the same value within 3s. Camera error or permission denied shows a message that points to the other two tabs.
- **Enter Code**: 6-character input, auto-uppercase, submit.
- **Find Guest**: search input, min 3 chars, debounce 300ms, calls `search_guests`. Each result shows name and status chips (Checked in, Cocktail, Bundle, Voided). Tapping a result opens a confirm dialog "Check in {name}?" or "Claim cocktail for {name}?", then calls the same RPC with `p_identifier = guest id` and `p_method = 'manual'`. Results whose action is already done show the status and a disabled action.
- RPC mapping: entrance calls `check_in_guest`, cocktail and bundle call `claim_station`. Methods: `scan`, `code`, `manual`.
- **Result card** (full width, big text, guest name, auto-clears after about 3s on scan tabs, dismiss on tap):
  - Green: `checked_in`, `claimed`.
  - Red: `already_checked_in`, `already_claimed` (show time in Manila), `voided`, `not_found`, `checkin_closed`, `pool_locked`, `station_disabled`.
  - Amber: `not_checked_in` ("Send to entrance").
- Optional: vibrate on success, short beep (user-gesture gated).
- Wake lock while the scanner is open, if supported.

### 9.5 Admin layout

- Sidebar on desktop, bottom or drawer navigation on mobile. Logo top-left.
- Sections: Dashboard, Guests, Staff, Raffle, Activity Logs, Settings.

### 9.6 Dashboard

- Cards: **Registered**, **Eligible (present)**, **Cocktail claimed**, **Bundle claimed**. Smaller: Not checked in, Voided, Winners.
- No maximum or percentage.
- Data from `dashboard_stats`, polled every 5 seconds while the tab is visible.
- Last 10 activity rows from `activity_logs`.

### 9.7 Guests

- Source: `guest_overview` view. Guests only, never staff.
- Columns: name, registered at, status (Registered / Checked in / Voided), Cocktail, Bundle.
- Search, filters (checked in, not checked in, voided, claimed or not per station).
- Row actions with a reason dialog: Void, Restore, Undo check-in, Undo claim (cocktail or bundle). Map RPC error codes to readable messages.
- **Export all (CSV)**: name, registered at, checked in at, status, cocktail, bundle, voided. Manila time. UTF-8 BOM. Prefix any cell starting with `=`, `+`, `-`, `@` with a single quote. Call `log_admin_action('export_guests')`.
- Mobile: stacked cards.

### 9.8 Staff

- Source: `staff` table (admin select). Staff and admin accounts only, never guests.
- Columns: name, role, station, active, last active.
- Actions: toggle active, change station (not for admins). Updates only touch `full_name`, `station`, `active`.
- Info panel explains how to add staff manually (Supabase Authentication > Users, then `templates/add_staff.sql`). Do not build account creation in the UI.
- An admin cannot deactivate their own account (disable the toggle on their own row).

### 9.9 Raffle

- Pool count from `raffle_pool`: "Eligible pool: N".
- **Copy raffle names**: fetch `raffle_pool`, copy one name per line to clipboard (with a textarea fallback), toast the count, call `log_admin_action('copy_raffle_names', { count })`.
- **Download .txt** of the same list.
- Label next to the buttons: "Only checked-in, non-voided, not-yet-winning guests."
- **Winners log**: table with name, prize, drawn at, status.
  - Add winner dialog: search within `raffle_pool` (combobox) plus prize text, calls `record_winner`.
  - Void winner dialog: reason (required) and checkbox "Put back in raffle pool (wrong entry)". Default off (absent winner stays out). Calls `void_winner`.
- **Lock raffle pool** toggle (writes `settings.raffle_locked`): while locked, nobody can check in. Warn before locking.
- Note on the page: the wheel is an external site. Winners are entered here manually.

### 9.10 Activity logs

- Columns: time (Manila), actor, role, action, guest, station, method, result.
- Filters: date range, station, actor, method, result, action. Pagination of 50 rows per page (use `range`).
- Read-only. No edit or delete.
- Human labels for actions: `register`, `check_in`, `claim`, `void_guest`, `restore_guest`, `undo_check_in`, `undo_claim`, `record_winner`, `void_winner`, `export_guests`, `copy_raffle_names`, `update_settings`.

### 9.11 Settings

- Event name, date, venue, notice text.
- Registration: open toggle, closes at (date-time).
- Check-in: open toggle, closes at (date-time).
- Stations: Cocktail enabled, Bundle of Joy enabled.
- Date-time inputs are interpreted as `Asia/Manila` and stored as ISO with `+08:00`.
- Validate: closes-at in the past warns the admin. Saving calls an update on `settings` (set `updated_at`) and `log_admin_action('update_settings')`.
- Defaults after seed: registration closed, check-in closed. Admin must open them for the event.

---

## 10. Security checklist

- [ ] Public sign-ups disabled in Supabase Auth. Admin and staff created manually.
- [ ] RLS enabled on all six tables. Anon has no table access.
- [ ] `token` and `backup_code` are not selectable by `anon` or `authenticated`.
- [ ] Every staff/admin RPC re-checks role inside the function.
- [ ] Registration only through the Edge Function, with Turnstile verified server-side.
- [ ] CORS on the Edge Function restricted to the production origin.
- [ ] Service role key never in the frontend or git.
- [ ] `activity_logs` append-only (trigger).
- [ ] Deactivated staff fail all RPC checks even with a valid session.
- [ ] Search returns max 5 rows, min 3 chars, no secrets.
- [ ] Inputs validated on client (Zod) and server (SQL).
- [ ] CSV export guards against formula injection.
- [ ] `vercel.json` sets security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self)`. Do not add a strict CSP unless Turnstile (`challenges.cloudflare.com`) and the Supabase origin are allowed.
- [ ] `<meta name="robots" content="noindex">` and `robots.txt` with `Disallow: /`.
- [ ] Strong admin password. MFA optional.
- [ ] Never log tokens or backup codes.

`vercel.json` also needs an SPA rewrite: all paths to `/index.html`.

---

## 11. Phases

Stop after each phase and wait for approval.

### Phase 0 — Project setup

Tasks:
1. Create the Vite + React + TypeScript project (strict mode).
2. Install and configure Tailwind, then run `npx shadcn@latest init -t vite`, then `npx boardui@latest init` (see section 4 rules).
3. Install dependencies: `react-router-dom`, `@tanstack/react-query`, `@supabase/supabase-js`, `react-hook-form`, `zod`, `@hookform/resolvers`, `qrcode.react`, `qr-scanner`, `@marsidev/react-turnstile`, `lucide-react`, `sonner`, `@fontsource-variable/inter`.
4. Apply design tokens in `src/index.css`. Light mode only.
5. Create the folder structure, `.env.example`, `.gitignore`, `vercel.json`, `public/robots.txt`, temporary `public/logo.svg`.
6. Create `supabase/` folder with README, APPLIED.md, and empty SQL files named per section 6.

Acceptance: `npm run dev` runs, a test page shows tokens (background, primary button, three status colors, three station badges), TypeScript strict passes, build succeeds.

### Phase 1 — Database

Tasks:
1. Write every SQL file exactly as in section 6, plus `99_verify.sql` and the two templates.
2. Write `supabase/README.md` and `APPLIED.md`.
3. Owner runs files 01 to 10 in order, then `99_verify.sql`. Owner creates the admin user and runs `create_admin.sql`. Owner disables public sign-ups.
4. Write `src/types/db.ts` with types for RPC results and views.

Acceptance: verify script passes, `select get_public_settings()` returns the event data, no table is readable by anon.

### Phase 2 — App shell, auth, layouts

Tasks: `lib/supabase.ts`, `lib/env.ts`, `lib/format.ts`, router, `useSession`, `useStaffProfile`, `usePublicSettings`, `GuestLayout`, `StaffLayout`, `AdminLayout`, `Logo`, `StatusBadge`, `ResultCard`, `ConfirmDialog`, `LoginPage`, `RequireRole`, 404 page.

Acceptance: admin logs in and lands on `/admin` (empty placeholder), a staff user lands on `/scan` placeholder, guests cannot reach `/admin` or `/scan`, a deactivated staff user is signed out with a message, logout works, layouts look right at 360px and 1280px.

### Phase 3 — Edge Function, registration, guest pass

Tasks: `register-guest` function, Register page, Pass page, `localStorage` token handling, Turnstile integration, error states.

Acceptance:
- Register with a new name returns a pass with QR and backup code.
- Same name with different case or extra spaces returns the duplicate error.
- Registration closed shows the closed card. Open it in Settings (SQL update for now) and it works.
- Turnstile failure blocks registration.
- Pass page refreshes status on focus.
- Screenshot of the pass still scans.
- Page loads fast on throttled mobile (Slow 4G in devtools).

### Phase 4 — Scanner

Tasks: station-locked scanner, three tabs, result cards, manual flows with confirm dialog, debouncing, camera error handling.

Acceptance (test all with at least two real phones):
- Entrance scan checks in. Second scan shows red "Already checked in" with time.
- Cocktail scan before check-in shows amber "Send to entrance".
- Cocktail scan after check-in claims. Second scan shows red "Already claimed" with time.
- Same flow for Bundle of Joy.
- Backup code works for all three stations.
- Find Guest works for all three stations, and a repeat search shows the right status.
- Voided guest is rejected at every station.
- Check-in closed message appears for staff after cutoff. Admin can still check in.
- Camera denied still allows code and search.
- Every action appears in `activity_logs` with the right method.

### Phase 5 — Admin: dashboard and guests

Tasks: admin layout navigation, dashboard cards and polling, recent activity, guests table with filters, void/restore/undo dialogs, CSV export.

Acceptance: counts match the database, numbers update within 5s of a scan, void/restore/undo work and log, undo check-in is blocked when claims exist, CSV opens correctly in Excel with Filipino names and no formula injection.

### Phase 6 — Admin: raffle, staff, logs, settings

Tasks: raffle page (pool, copy, download, winners log, void winner, lock), staff page, logs page with filters and pagination, settings page.

Acceptance:
- Copy raffle names pastes only checked-in, non-voided, non-winning guests.
- Recording a winner removes them from the pool. Voiding with "put back" returns them. Voiding as absent keeps them out.
- Locked pool blocks check-in for everyone.
- Staff page lists staff only, no guests. Guests page lists guests only, no staff.
- Settings save and take effect immediately on the register page and scanner.
- Logs show every action with filters working.

### Phase 7 — Hardening, QA, deploy

Tasks:
1. Walk the security checklist (section 10).
2. Verify as `anon` with the REST API (curl or Postman) that `guests`, `staff`, `settings` return nothing or errors.
3. Load test: insert 400 dummy guests (script in `supabase/templates/dummy_guests.sql`, delete afterwards), open the register page on many devices or a simple load tool, confirm no errors.
4. Test on a cheap Android phone and an iPhone: register, pass, scan, low brightness, screenshot scan.
5. Deploy to Vercel. Set env vars. Update `ALLOWED_ORIGIN` and production Turnstile keys. Retest registration on the live domain.
6. Replace the temporary logo.
7. Write `docs/EVENT_DAY.md` with the runbook below.

Acceptance: every item in the QA checklist passes on the live URL.

---

### Phase 8 — Staff management in the UI (Edge Function `manage-staff`)

**Prerequisite:** Phases 0–7 done and app deployed. Do not start before the core flow (register, pass, scan, admin) works on the live URL.

**Goal:** Admin creates staff accounts, resets passwords, and activates/deactivates staff from the Staff page. No trips to the Supabase dashboard. `templates/add_staff.sql` stays as a fallback.

**Amendments to earlier sections:**
- Section 9.8 (Staff): "Do not build account creation in the UI" no longer applies. Admin accounts are still created via `templates/create_admin.sql`.
- Section 9.8 actions: active toggle goes through the Edge Function (not a direct table update). Station change still uses a direct update on `staff.station`.
- Section 6 / `09_grants.sql`: direct `update (active)` grant is revoked in `11_staff_management.sql`. Never edit `09_grants.sql`.

**Tasks:**
1. `supabase/sql/11_staff_management.sql` — revokes `update (active)` on `staff` from `authenticated`. Add to `APPLIED.md` and `README.md`. Extend `99_verify.sql` with a PASS/FAIL check.
2. Edge Function `supabase/functions/manage-staff/index.ts` — actions: `create`, `reset_password`, `set_active`. Caller must be admin. Orphan cleanup on insert failure. Ban sync on `set_active`. Direct `activity_logs` insert (no `write_log()`). Deploy by pasting into Supabase dashboard > Edge Functions > name exactly `manage-staff` > JWT verification ON. No new secrets.
3. Frontend `src/features/admin/staff/` — `api.ts`, `generatePassword.ts`, `AddStaffDialog.tsx`, `ResetPasswordDialog.tsx`, `StaffCredentialsPanel.tsx`. Staff page: Add staff button, row actions (reset password, activate/deactivate, change station), admin rows show no actions, isSelf shows "You" badge. Password shown only once; never stored in localStorage, query cache, URL, or logs.
4. `src/types/db.ts` — add `ManageStaffAction`, `ManageStaffErrorCode`, `ManageStaffRequest`, `ManageStaffResult`, and extend `LogAction` union.
5. Docs: update `supabase/README.md`, `supabase/APPLIED.md`, `docs/EVENT_DAY.md`, `plan.md`.

**Acceptance:** build and lint pass; can create a staff account from UI; credentials panel shows once then clears; deactivated staff cannot log in; audit log entry appears for each action.

---

### Phase 9 — Team and Site on registration, per-team dashboard, team filter in Guests

**Prerequisite:** Phases 0 to 7 are done. Do this phase **before registration opens** on the live site. It changes the registration contract (SQL, Edge Function, and frontend), so the three must go live together.

**Goal:** guests pick their **Team** from a preloaded dropdown when they register. **Site** fills in automatically from the team. The admin sees present and registered counts per team and overall, and filters the Guests list by team.

#### Decisions (change only if the owner says so)

1. **Site is derived from Team.** Only `team_id` is stored on the guest. Site comes from the team's row. The client never sends a site, and the server never trusts one.
2. **Teams live in a `teams` table**, seeded by SQL, not hardcoded in the frontend. Fixing a typo later means a new SQL file, not a code change.
3. **Team is required.** Registration without a valid team is rejected.
4. **Duplicate-name rule is unchanged:** one global unique name (`name_normalized`). Two people with the same name in different teams are still blocked and go to the help desk. The raffle wheel only knows names, so this keeps winners unambiguous.
5. **Existing guests (test data)** keep `team_id = null` and show as "Unassigned". Real registrations always have a team.
6. **Guests page default** is "All teams", paginated at 50 per page, with the team filter at the top. The filter value lives in the URL (`?team=<id>` or `?site=Toledo`).
7. **Team select on the register form is a native `<select>` with `<optgroup>`**, styled to match shadcn. Native pickers are fastest and most reliable on cheap phones, and the optgroup label is the "separator" the client asked for.

#### Amendments to earlier sections

- **Section 6 (tables):** `guests` gains `team_id`. New table `teams`. `guest_overview`, `get_pass`, `search_guests`, and `register_guest_internal` are replaced by `12_teams.sql`.
- **Section 7 (Edge Function):** `register-guest` now accepts `{ name, team_id, turnstileToken }`.
- **Section 9.1:** register form adds Team and Site fields.
- **Section 9.2:** pass shows team and site.
- **Section 9.4:** Find Guest results show team and site next to the name.
- **Section 9.6:** dashboard adds a "By team" section.
- **Section 9.7:** Guests page adds team and site filters, server-side pagination, and Team and Site columns. CSV gains Team and Site columns.

#### Team list (exact spelling, in this order)

**Toledo Team** (site `Toledo`), `sort_order` 1 to 21:
1. ACA CAMPAIGN
2. PHARMA
3. ACA- ELITE
4. MEMBERSHIP PROGRAM
5. ACE- APPOINTMENT SETTERS
6. PSL
7. JACUZZI - CAMP
8. HYBRID RIDE
9. I-MARKETING
10. PRE-Q
11. EPIQ
12. HCP
13. RIFI
14. SPARK - OUTSOURCING
15. DEBT
16. IDENT
17. SPARK VIRTUAL ASSISTANT
18. IT DEPARTMENT
19. TRAINING TEAM
20. MP QC/ QA DEPARTMENT
21. MANAGEMENT / ADMIN TEAM

**Talisay Team** (site `Talisay`), `sort_order` 1 to 2:
1. ACA
2. MEMBERSHIP PROGRAM - Talisay

Optgroup labels in the dropdown: `Toledo Team` and `Talisay Team`. Keep the names exactly as written above (the client's spelling). The owner will confirm the spellings with the client before the event.

#### Tasks

**1. New SQL file `supabase/sql/12_teams.sql`**

Never edit applied files. This is a new file. If Phase 8 was not added, the gap in numbering (no `11`) is fine.

```sql
-- Teams and sites ------------------------------------------------------------

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 80),
  site text not null check (site in ('Toledo', 'Talisay')),
  sort_order int not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index teams_site_sort_idx on public.teams (site, sort_order);

alter table public.teams enable row level security;
revoke all on public.teams from anon, authenticated;
create policy teams_admin_select on public.teams
  for select to authenticated using (public.is_admin());
grant select on public.teams to authenticated;

alter table public.guests
  add column team_id uuid references public.teams (id) on delete restrict;
create index guests_team_idx on public.guests (team_id);
-- guest_overview is security_invoker, so the new column needs a column grant
grant select (team_id) on public.guests to authenticated;

insert into public.teams (name, site, sort_order) values
  ('ACA CAMPAIGN', 'Toledo', 1),
  ('PHARMA', 'Toledo', 2),
  ('ACA- ELITE', 'Toledo', 3),
  ('MEMBERSHIP PROGRAM', 'Toledo', 4),
  ('ACE- APPOINTMENT SETTERS', 'Toledo', 5),
  ('PSL', 'Toledo', 6),
  ('JACUZZI - CAMP', 'Toledo', 7),
  ('HYBRID RIDE', 'Toledo', 8),
  ('I-MARKETING', 'Toledo', 9),
  ('PRE-Q', 'Toledo', 10),
  ('EPIQ', 'Toledo', 11),
  ('HCP', 'Toledo', 12),
  ('RIFI', 'Toledo', 13),
  ('SPARK - OUTSOURCING', 'Toledo', 14),
  ('DEBT', 'Toledo', 15),
  ('IDENT', 'Toledo', 16),
  ('SPARK VIRTUAL ASSISTANT', 'Toledo', 17),
  ('IT DEPARTMENT', 'Toledo', 18),
  ('TRAINING TEAM', 'Toledo', 19),
  ('MP QC/ QA DEPARTMENT', 'Toledo', 20),
  ('MANAGEMENT / ADMIN TEAM', 'Toledo', 21),
  ('ACA', 'Talisay', 1),
  ('MEMBERSHIP PROGRAM - Talisay', 'Talisay', 2)
on conflict (name) do nothing;

-- Public dropdown data (no table access for anon) ----------------------------

create or replace function public.get_teams()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', t.id, 'name', t.name, 'site', t.site)
      order by case when t.site = 'Toledo' then 1 else 2 end, t.sort_order
    ),
    '[]'::jsonb
  )
  from public.teams t
  where t.active;
$$;

-- Registration now requires a team --------------------------------------------

drop function if exists public.register_guest_internal(text);

create or replace function public.register_guest_internal(p_name text, p_team_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.settings;
  t public.teams;
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

  select * into t from public.teams where id = p_team_id and active;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid_team', 'message', 'Select your team.');
  end if;

  v_norm := public.normalize_name(v_name);

  loop
    v_token := public.generate_token();
    v_code := public.generate_backup_code();
    begin
      insert into public.guests (name, name_normalized, token, backup_code, team_id)
      values (v_name, v_norm, v_token, v_code, t.id)
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

  perform public.write_log('register', v_id, v_name, null, null, 'success',
    jsonb_build_object('team', t.name, 'site', t.site));

  return jsonb_build_object('ok', true, 'name', v_name, 'token', v_token,
    'backup_code', v_code, 'team', t.name, 'site', t.site);
end;
$$;

-- Pass shows team and site ------------------------------------------------------

create or replace function public.get_pass(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g public.guests;
  t public.teams;
begin
  select * into g from public.guests where token = lower(btrim(coalesce(p_token, '')));

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select * into t from public.teams where id = g.team_id;

  return jsonb_build_object(
    'ok', true,
    'name', g.name,
    'team', t.name,
    'site', t.site,
    'token', g.token,
    'backup_code', g.backup_code,
    'checked_in', g.checked_in_at is not null,
    'voided', g.voided,
    'cocktail_claimed', exists (select 1 from public.claims c where c.guest_id = g.id and c.station = 'cocktail'),
    'bundle_claimed', exists (select 1 from public.claims c where c.guest_id = g.id and c.station = 'bundle')
  );
end;
$$;

-- Find Guest shows team and site so staff can tell similar names apart ---------

create or replace function public.search_guests(p_query text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  q text := public.normalize_name(p_query);
begin
  if not public.is_active_staff() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if char_length(q) < 3 then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(r))
    from (
      select
        g.id,
        g.name,
        t.name as team,
        t.site as site,
        g.checked_in_at,
        g.voided,
        exists (select 1 from public.claims c where c.guest_id = g.id and c.station = 'cocktail') as cocktail_claimed,
        exists (select 1 from public.claims c where c.guest_id = g.id and c.station = 'bundle') as bundle_claimed
      from public.guests g
      left join public.teams t on t.id = g.team_id
      where strpos(g.name_normalized, q) > 0
      order by g.name
      limit 5
    ) r
  ), '[]'::jsonb);
end;
$$;

-- Admin guest list: new columns are added at the END (required by create or replace view)

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
  exists (select 1 from public.claims c where c.guest_id = g.id and c.station = 'bundle') as bundle_claimed,
  g.team_id,
  t.name as team,
  t.site as site
from public.guests g
left join public.teams t on t.id = g.team_id;

-- Per-team stats for the dashboard ------------------------------------------------
-- Same definitions as dashboard_stats: registered = all rows, eligible = checked in and not voided,
-- claims exclude voided guests. Per-team rows add up to the overall numbers.

create or replace function public.team_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.site_order, r.sort_order)
    from (
      select
        t.id,
        t.name,
        t.site,
        case when t.site = 'Toledo' then 1 else 2 end as site_order,
        t.sort_order,
        count(g.id) as registered,
        count(g.id) filter (where g.checked_in_at is not null and not g.voided) as eligible,
        count(g.id) filter (where not g.voided and exists (
          select 1 from public.claims c where c.guest_id = g.id and c.station = 'cocktail')) as cocktail_claimed,
        count(g.id) filter (where not g.voided and exists (
          select 1 from public.claims c where c.guest_id = g.id and c.station = 'bundle')) as bundle_claimed
      from public.teams t
      left join public.guests g on g.team_id = t.id
      group by t.id

      union all

      select
        null::uuid,
        'Unassigned'::text,
        'Unassigned'::text,
        3,
        999,
        count(g.id),
        count(g.id) filter (where g.checked_in_at is not null and not g.voided),
        count(g.id) filter (where not g.voided and exists (
          select 1 from public.claims c where c.guest_id = g.id and c.station = 'cocktail')),
        count(g.id) filter (where not g.voided and exists (
          select 1 from public.claims c where c.guest_id = g.id and c.station = 'bundle'))
      from public.guests g
      where g.team_id is null
      having count(g.id) > 0
    ) r
  ), '[]'::jsonb);
end;
$$;

-- Grants (new functions need explicit grants) ---------------------------------------

grant execute on function public.get_teams() to anon, authenticated;
grant execute on function public.register_guest_internal(text, uuid) to service_role;
grant execute on function public.get_pass(text) to anon, authenticated;
grant execute on function public.search_guests(text) to authenticated;
grant execute on function public.team_stats() to authenticated;
```

- Add `12_teams.sql` to `supabase/README.md` (run order, after the last numbered file) and tick it in `supabase/APPLIED.md`.
- Extend `99_verify.sql`:
  - `anon` cannot `select` from `teams` or `guests`.
  - `anon` can call `get_teams()` and gets 23 rows.
  - `register_guest_internal(text, uuid)` exists and the old `(text)` version does not.
  - `authenticated` non-admin calling `team_stats()` raises `not_authorized`.
  - Sum of `registered` in `team_stats()` equals `dashboard_stats().registered`, and same for `eligible`, `cocktail_claimed`, `bundle_claimed`.
- Cursor does not run any SQL. The owner runs it.

**2. Edge Function `register-guest` update**

- Accept `{ name, team_id, turnstileToken }`. Reject if `team_id` is not a string matching a UUID.
- Call `rpc('register_guest_internal', { p_name: name, p_team_id: team_id })`.
- Status codes: add 400 for `invalid_team`. Everything else stays as in section 7.
- Redeploy by pasting into the Supabase dashboard editor (JWT verification stays on).

**3. Frontend: register form (section 9.1)**

- Field order: Full name, **Team**, **Site**, the "must be present" checkbox, Turnstile, Register.
- Load teams with `supabase.rpc('get_teams')` through TanStack Query (`staleTime` 1 hour). Fire it in parallel with `get_public_settings`. Keep the page tiny.
- **Team** field:
  - Native `<select>` styled with the shadcn input classes, at least 52px high, font size at least 16px.
  - First option is a disabled placeholder "Select your team".
  - Two `<optgroup>` blocks, `Toledo Team` and `Talisay Team`, built by grouping the RPC result by `site`.
  - Required. Zod: `team_id` must be a UUID that exists in the loaded list, message "Select your team."
- **Site** field:
  - Read-only (disabled input, `aria-readonly`), same look as the other inputs but muted.
  - Shows "Auto-filled from team" until a team is picked, then the team's site (`Toledo` or `Talisay`).
  - Updates instantly when the team changes. It is display only and is **not** sent to the server.
- If `get_teams` fails or returns an empty list: show a "Could not load teams" card with a Retry button and disable submit.
- Send `{ name, team_id, turnstileToken }` to the Edge Function.
- Error mapping: add `invalid_team` as an inline error under Team.

**4. Frontend: guest pass (section 9.2)**

- Under the guest name, show `Team · Site` (for example `PHARMA · Toledo`). Hide the line if `team` is null.

**5. Frontend: scanner Find Guest (section 9.4)**

- Each result shows `Team · Site` under the name in muted text. Nothing else changes. Scan and code result cards are unchanged.

**6. Frontend: admin dashboard (section 9.6)**

- Keep the existing four big cards and the three small ones.
- Add a **By team** section below them:
  - Fetch `team_stats` in the same polling query as `dashboard_stats` (every 5 seconds, only while the tab is visible).
  - Group rows by `site` with a header per site: `Toledo` and `Talisay`, each with a subtotal line "N present · M registered" computed from its rows.
  - Each team gets a compact card: team name (clamp to 2 lines, full name in `title`), **Present** as the big number (`eligible`), and "of M registered" in small muted text. No percentages or progress bars, consistent with the rest of the dashboard.
  - The grid is responsive: 2 columns at 360px, 3 to 4 on tablets, 4 to 6 on desktop.
  - Clicking a team card goes to `/admin/guests?team=<team_id>`. Clicking a site header goes to `/admin/guests?site=Toledo` (or `Talisay`).
  - An "Unassigned" card appears only if the function returns that row. It links to `/admin/guests?team=none`.
  - Teams with zero guests still show, with 0 and 0.
- Skeletons while loading. Empty and error states as everywhere else.

**7. Frontend: Guests page (section 9.7)**

- Add a filter bar: **Team** select, then the existing search and status filters.
- Team select options:
  - `All teams` (default)
  - `Toledo (all teams)` and `Talisay (all teams)` as site-level options
  - An optgroup per site with each team, labeled `Team name (registered count)` using counts from `team_stats`
  - `Unassigned` if that row exists
- Filter state lives in the URL (`team`, `site`, `q`, `status`, `page`) so the dashboard cards can deep-link, and a refresh keeps the view.
- Switch the list to **server-side filtering and pagination**:
  - Query `guest_overview` with `.eq('team_id', id)` or `.in('team_id', idsOfSite)` or `.is('team_id', null)`, `.ilike('name', ...)` for search (escape `%` and `_`), status filters, `.order('name')`, `.range()` of 50 rows, `count: 'exact'`.
  - Show "Showing X to Y of N guests" and Previous / Next.
  - Changing any filter resets to page 1.
- Add **Team** and **Site** columns (stacked cards on mobile show them as a line under the name).
- CSV export:
  - **Export all (CSV)** keeps exporting everyone and gains **Team** and **Site** columns. For large lists, fetch in pages of 1000 until done.
  - When a team or site filter is active, also show **Export this team** (or **Export this site**) that exports only the filtered rows.
  - Same rules as before: UTF-8 BOM, formula-injection guard, Manila time, and call `log_admin_action('export_guests')` with the filter in `details`.
- The raffle page and **Copy raffle names** are unchanged (names only).

**8. Types and docs**

- Update `src/types/db.ts`: `Team`, `TeamStats`, the new `register-guest` request and response, the new `guest_overview` columns, the `get_pass` and `search_guests` shapes.
- Update `supabase/README.md`: table list gains `teams`, function list gains `get_teams` and `team_stats`.
- Update `docs/EVENT_DAY.md`: "Confirm the final team list and spellings with the client before opening registration."

**9. Owner steps after Cursor finishes**

Do these before registration opens, in this order:
1. Run `12_teams.sql` in the Supabase SQL Editor, then `99_verify.sql`. Tick `APPLIED.md`.
2. Paste the updated `register-guest` into the Supabase Edge Functions editor and deploy.
3. Redeploy the frontend.
4. Optional, before the event only: clear the test guests (they would show as "Unassigned").
   ```sql
   -- OWNER ONLY. Deletes ALL guests and their claims and winners. activity_logs rows stay (append-only).
   -- Never run this once real event data exists. Cursor must not run this.
   delete from public.winners;
   delete from public.claims;
   delete from public.guests;
   ```

If the frontend goes live before steps 1 and 2, registration breaks (the old function has no team). Keep registration closed during the switch.

#### Not in this phase

- No admin UI to add, rename, or deactivate teams (use a new SQL file).
- No team on the scan result cards (Find Guest only).
- No per-team raffle or per-team wheel export.
- No change to the one-global-unique-name rule.

#### Acceptance

- The register page shows Team with two groups (`Toledo Team` 21 teams, `Talisay Team` 2 teams) in the exact order and spelling above.
- Picking any Toledo team sets Site to `Toledo`. Picking either Talisay team sets Site to `Talisay`. Changing the team updates Site.
- Submit is blocked without a team. A forged request with a missing or fake `team_id` returns 400 `invalid_team` and nothing is inserted.
- A forged `site` value in the request is ignored (the stored site always comes from the team).
- A successful registration stores `team_id`. The pass shows `Team · Site`.
- The same name with different casing or spaces is still rejected, even for a different team.
- `get_teams()` works for anon. `anon` still cannot read `teams` or `guests` directly.
- Find Guest results show `Team · Site`.
- Dashboard "By team" lists all 23 teams grouped by site, with present and registered counts. Subtotals per site and the sum of all team cards match the overall cards (check with test data across at least three teams).
- Check in a guest from team X and the X card's Present number goes up within 5 seconds.
- Clicking a team card opens Guests filtered to that team. Clicking a site header filters to that site.
- Guests page: team and site filters work and combine with search and status. Pagination shows 50 per page with the correct total. The URL keeps the filters on refresh.
- CSV export includes Team and Site. "Export this team" only contains that team.
- Old test guests appear as "Unassigned" and do not break any page.
- Works at 360px and 1280px. `npm run build` and TypeScript strict pass. Register page stays fast on throttled Slow 4G.

#### Additions to the security checklist (section 10)

- [ ] `teams` has RLS on and no anon access. The dropdown data only comes from `get_teams()` (id, name, site).
- [ ] Site is never accepted from the client.
- [ ] `team_id` is validated as a UUID in the Edge Function and as an active team in SQL.
- [ ] `team_stats()` is admin-only.

#### Additions to the QA checklist (section 12)

- [ ] Register once per site (one Toledo team, one Talisay team) on a real phone and confirm Site auto-fills
- [ ] Dashboard team numbers match the overall numbers
- [ ] Guests page team filter, pagination, and CSV team export work on the live URL

---

## 12. QA checklist (run on production URL)

- [ ] Register, duplicate name blocked, lowercase and extra-space duplicate blocked
- [ ] Pass QR scans from a screenshot on a cheap Android and an iPhone
- [ ] Backup code works at all three stations
- [ ] Check-in, cocktail, bundle each work once and block the second time
- [ ] Unchecked guest rejected at cocktail and bundle
- [ ] Manual search flows work and log `manual`
- [ ] Voided guest rejected everywhere
- [ ] Raffle copy contains only eligible names
- [ ] Winner void flows behave as described
- [ ] Registration and check-in cutoffs enforced server-side
- [ ] Guest cannot open `/admin` or call admin RPCs (should error)
- [ ] Deactivated staff blocked
- [ ] 400 dummy guests: dashboard and guests list still fast
- [ ] Works on venue-like network (mobile data, not just wifi)

## 13. Event-day runbook (for `docs/EVENT_DAY.md`)

**One day before**
- Open the Supabase dashboard to make sure the free project is not paused.
- Log in on every staff phone and set the station, keep the browser logged in.
- Test the camera on each staff phone. Charge phones, bring power banks.
- Set registration open and check-in open times in Settings. Confirm the timezone shows Manila.
- Print the registration QR poster with: event name, "Scan to register", "Take a screenshot of your pass", "Must be present to win."
- Put the help desk sign at the entrance.

**During the event**
- Entrance: two or three staff phones on Check-in.
- Help desk: one phone with Find Guest for lost passes.
- Admin: dashboard open. Before each draw, copy raffle names fresh, paste into the wheel, record the winner here.
- Absent winner: void the win (not put back), redraw.

**After check-in cutoff**
- Optionally lock the raffle pool.

**After the event**
- Export all guests as CSV and keep a copy.
- Close registration and check-in.

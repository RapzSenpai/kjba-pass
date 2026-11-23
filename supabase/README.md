# KJBA Pass database

Everything runs by hand in the Supabase dashboard: **SQL Editor > paste the file > Run**. Do not use the Supabase CLI or migrations.

## Apply order

Run these once, in order:

| File | What it does |
|---|---|
| `sql/01_extensions.sql` | Enable `pgcrypto` in the `extensions` schema |
| `sql/02_tables.sql` | Six tables, indexes, append-only trigger on `activity_logs` |
| `sql/03_helpers.sql` | Role checks, name normalization, token and backup code, logging, guest resolve |
| `sql/04_views.sql` | `raffle_pool` and `guest_overview` |
| `sql/05_rls.sql` | Enable RLS and admin/staff policies |
| `sql/06_functions_public.sql` | Public settings, internal registration, guest pass |
| `sql/07_functions_staff.sql` | Check-in, station claim, guest search |
| `sql/08_functions_admin.sql` | Void, undo, raffle, dashboard, admin log |
| `sql/09_grants.sql` | Revoke defaults, grant only the intended execute and column access |
| `sql/10_seed.sql` | Insert the single settings row |
| `sql/11_staff_management.sql` | Revoke direct `update (active)` on staff |
| `sql/12_teams.sql` | Teams, sites, registration team requirement, per-team stats |
| `sql/99_verify.sql` | Read-only checks after the files above; every row must say PASS |

Tick each row in `APPLIED.md` after running it.

When a new function is added later, run its `grant execute` line in a new numbered SQL file. Never edit a file that has already been applied.

## Tables

| Table | Purpose |
|---|---|
| `settings` | Single row: event info, registration and check-in windows, station switches |
| `staff` | Staff and admin accounts, role and station, active flag |
| `guests` | Registered guests, token, backup code, team, check-in, void |
| `teams` | Team names and their site (Toledo or Talisay) |
| `claims` | One row per guest per station (cocktail, bundle) |
| `winners` | Raffle winners log |
| `activity_logs` | Append-only audit trail |

Views: `raffle_pool` (eligible names for the wheel), `guest_overview` (admin guest list with claim flags, team, site, no secrets).

Functions: `get_teams()` feeds the registration dropdown; `team_stats()` feeds the dashboard's per-team counts. Both are granted explicitly in `12_teams.sql`.

## Auth setup

1. Authentication settings: turn **off** public sign-ups. There is no guest login.
2. Create the admin user in **Authentication > Users > Add user** and auto-confirm it.
3. Copy that user's UUID into `templates/create_admin.sql`, replace the placeholder values, and run it once.
4. Create each staff user the same way and run `templates/add_staff.sql` with their UUID, name, and station (`entrance`, `cocktail`, or `bundle`).
5. `templates/dummy_guests.sql` inserts 400 test guests for load verification, with cleanup statements included.

The templates are **not** part of the run order. They are run once per person or as needed for testing.

## Acceptance checks

- `sql/99_verify.sql` returns PASS on every row.
- `select public.get_public_settings();` returns the event data.
- `set local role anon; select * from public.guests;` fails (roll back afterwards).
- `select token from public.guests;` as `authenticated` fails.

## Edge Functions

### `register-guest`

Paste `supabase/functions/register-guest/index.ts` into the Supabase dashboard **Edge Functions** editor, name it exactly `register-guest`. Keep JWT verification **on**. The client calls it with `supabase.functions.invoke`.

Secrets to set in the dashboard:

- `TURNSTILE_SECRET_KEY`
- `ALLOWED_ORIGIN` (the Vercel domain, no trailing slash; comma-separated for local dev, e.g. `https://your-app.vercel.app,http://localhost:5173`)

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically. Never put the service role key in frontend code or in a file committed to git.

Written in Phase 3.

### `manage-staff`

Paste `supabase/functions/manage-staff/index.ts` into the Supabase dashboard **Edge Functions** editor, name it exactly `manage-staff`. Keep JWT verification **on**.

**No new secrets needed.** It reuses `ALLOWED_ORIGIN` already set above. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

Supports three actions (POST body `{ action, ...fields }`):
- `create` — creates Auth user + staff row; on staff insert failure, deletes the orphan Auth user.
- `reset_password` — updates password for a `role = 'staff'` target only.
- `set_active` — toggles `staff.active` and bans/unbans the Auth user.

Admin rows and the caller's own row are protected. All actions are written to `activity_logs` directly (not via `write_log()`).

The first admin account is still created via `templates/create_admin.sql`. See **Auth setup** above.

Written in Phase 8.

## SQL run order (including Phase 8)

| File | What it does |
|---|---|
| `sql/01_extensions.sql` | Enable `pgcrypto` |
| `sql/02_tables.sql` | Tables, indexes, append-only trigger |
| `sql/03_helpers.sql` | Role checks, token, logging helpers |
| `sql/04_views.sql` | `raffle_pool` and `guest_overview` |
| `sql/05_rls.sql` | RLS policies |
| `sql/06_functions_public.sql` | Public settings, registration, guest pass |
| `sql/07_functions_staff.sql` | Check-in, station claim, search |
| `sql/08_functions_admin.sql` | Void, undo, raffle, dashboard |
| `sql/09_grants.sql` | Revoke defaults, grant column/execute access |
| `sql/10_seed.sql` | Insert settings row |
| `sql/11_staff_management.sql` | Revoke direct `update (active)` on staff |
| `sql/12_teams.sql` | Teams, sites, registration team requirement, per-team stats |
| `sql/99_verify.sql` | Read-only PASS/FAIL checks |

### Phase 9 — Team and Site on registration, per-team dashboard, team filter in Guests

> Paste this block into `plan.md` after Phase 8 (or after Phase 7 if Phase 8 is not added) and before section 12. It amends sections 6, 7, 9.1, 9.2, 9.4, 9.6, 9.7, 10 and 12 as listed below. All other rules in `plan.md` still apply.

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

# KJBA Pass — Audit Plan (`audit.md`)

Audit the whole system: security, correctness, performance, seamlessness, reliability, code quality, and deployment readiness. The event is **Dec 19, 2026** (Toledo Megadome Sports Center, 300+ guests). A bug on the day means a queue at the door, so this audit looks for anything that breaks registration, check-in, claims, or the raffle, or leaks guest data.

Reference docs: `plan.md` (Phases 0 to 7, plus Phase 8 staff management and Phase 9 teams/sites if present), `supabase/sql/*.sql`, `supabase/functions/*`, `docs/EVENT_DAY.md`.

---

## 0. Rules for the auditor (read first)

1. **Audit mode is read-only.** Do not change app code, SQL files, or config during the audit. Write findings only. Fixes happen in a separate pass after the owner approves them (section 9).
2. **Never touch the production database with writes or load.** Run data-changing tests and load tests only against a **staging Supabase project** (a second free project, for example `kjba-pass-staging`, with the same SQL files applied and its own Edge Functions and secrets). If no staging project exists, stop and ask the owner to create one. Read-only queries on production are fine.
3. **Never run** the "clear test guests" snippet from Phase 9 or any `delete` on guests, claims, winners, or logs outside staging.
4. **No real personal data.** Use dummy names prefixed `ZZ Test`.
5. **Secrets:** never print, log, or commit keys. Read keys from environment variables (`SUPABASE_URL`, `ANON_KEY`, and so on). If you find a secret in the repo or the build output, report its location but not its value.
6. **Evidence is mandatory.** Every PASS needs proof (file path and line, a query result, or command output). Every FAIL needs the evidence and the impact. If you cannot verify something, mark it `CANNOT VERIFY` and say why. Never write "looks fine" without evidence.
7. **Skip what is not built.** If a feature from `plan.md` is not in the repo (for example Phase 8), mark its checks `N/A` and list it in the inventory. If something is built that the plan does not mention, list it.
8. **Two passes.**
   - **[A] Pre-deploy:** static review, SQL review, local build, staging tests.
   - **[B] Post-deploy:** run against the live URL and the production Supabase project (read-only plus a few clearly prefixed test registrations that the owner agrees to).
   Each check below is tagged `[A]`, `[B]`, or `[A+B]`.
9. **Status values:** `PASS`, `FAIL`, `N/A`, `CANNOT VERIFY`.
10. **Severity:**
    - **Blocker:** data leak, auth bypass, double claim or double check-in possible, registration or scanning broken, data loss.
    - **High:** wrong numbers, a rule can be bypassed, a serious failure under load or on a common phone.
    - **Medium:** degraded UX, missing safeguard, confusing error.
    - **Low:** polish, minor inconsistency.
    - **Nit:** style.

---

## 1. Inventory and plan conformance `[A]`

- **INV-01** List every route, screen, table, view, RPC, Edge Function, and SQL file that exists. Compare against `plan.md` (including Phases 8 and 9 if present). Report missing items and extras.
- **INV-02** Confirm `supabase/APPLIED.md` matches the SQL files in the repo. Ask the owner to run the verification queries in Appendix A and compare the results with the SQL files (applied state cannot be read from the repo).
- **INV-03** Confirm no application behavior depends on a SQL change that is not in a numbered file (no "run this once in the dashboard" instructions that are not saved in `supabase/`).
- **INV-04** Run `npm ci`, `npm run build`, and `npx tsc --noEmit`. All must succeed with zero errors. Report warnings.

---

## 2. Security `[A+B]`

### Secrets and configuration
- **SEC-01** `[A]` Search the repo and git history for `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY`, private keys, and JWTs (`git log -p -S`, `grep -r`). The service role key must appear only as a runtime secret read inside Edge Functions.
- **SEC-02** `[A]` Build the app and search `dist/` for the same strings. None may appear. Only the anon key and the Turnstile **site** key may be in the bundle.
- **SEC-03** `[A]` `.env` and `.env.local` are in `.gitignore` and not tracked. `.env.example` has no values.
- **SEC-04** `[B]` Production uses the real Turnstile keys, not the Cloudflare test keys (`1x00000000000000000000AA` and `1x0000000000000000000000000000000AA`). The Turnstile widget lists the production hostname.
- **SEC-05** `[B]` Supabase Auth: public sign-ups are disabled. No leftover test users, test staff, or default accounts in Authentication > Users. Admin password is strong.

### Database access control (use Appendix A queries and Appendix B curl tests)
- **SEC-10** `[A+B]` **Anon role:** with only the anon key, `select` on `guests`, `staff`, `settings`, `claims`, `winners`, `activity_logs`, `teams`, `raffle_pool`, `guest_overview` must all fail or return no rows. **Any row returned is a Blocker.**
- **SEC-11** `[A+B]` **Anon RPCs:** only `get_public_settings`, `get_pass`, and `get_teams` may be executable by anon. Every other function must be denied.
- **SEC-12** `[A+B]` **Staff role** (a non-admin staff login on staging): cannot read admin tables or views, cannot call admin RPCs, cannot read `guests.token` or `guests.backup_code` by any route (direct select, view, RPC).
- **SEC-13** `[A+B]` **Station lock:** a staff user assigned to `cocktail` calling `check_in_guest` or `claim_station` for `bundle` gets `not_authorized`. A deactivated staff user fails every RPC even with a valid session. Admin can act at all stations.
- **SEC-14** `[A]` Review every `SECURITY DEFINER` function: has `set search_path`, checks the caller's role at the top, uses no dynamic SQL built from input, and has the minimum `EXECUTE` grants. Internal helpers (`resolve_guest`, `write_log`, `generate_token`, `generate_backup_code`, `normalize_name`) must not be executable by anon or authenticated.
- **SEC-15** `[A]` Review all `jsonb` return shapes: only `get_pass` (own pass) and `register_guest_internal` (own pass, via the Edge Function) may return `token` or `backup_code`. `search_guests`, `guest_overview`, `raffle_pool`, `team_stats`, and logs must not.
- **SEC-16** `[A]` Views use `security_invoker = true`. RLS is enabled on every table. Every policy is intentional (list them in the report).
- **SEC-17** `[A]` `activity_logs` is append-only: attempt `update` and `delete` on staging as the service role and as admin, both must raise `activity_logs is append-only`. Logs contain no tokens, backup codes, or passwords (grep `write_log` calls and sample the `details` column).

### Edge Functions
- **SEC-20** `[A+B]` `register-guest`: rejects non-POST (405), missing or invalid Turnstile token (400), `name` or `team_id` of the wrong type, oversized bodies. It verifies Turnstile server-side before touching the database. Error responses leak no internals.
- **SEC-21** `[A+B]` CORS allows only the configured origin(s) (`ALLOWED_ORIGIN`). No wildcard. No localhost in production config.
- **SEC-22** `[A]` The service role client is created only inside functions. Nothing logs request bodies, tokens, passwords, or keys.
- **SEC-23** `[A]` `manage-staff` (Phase 8, else `N/A`): verifies the caller is an active admin server-side on every action; can only create `role = 'staff'`; cannot reset, deactivate, or modify admin accounts; rolls back the Auth user when the `staff` insert fails; never logs passwords.

### Tokens and enumeration
- **SEC-30** `[A]` Guest `token` is at least 80 bits of randomness from a CSPRNG (`gen_random_bytes`). `backup_code` is only accepted by staff RPCs (never by a public function), so it cannot be brute forced by guests. Report the keyspace.
- **SEC-31** `[A]` Public error messages do not reveal whether a name exists beyond the intended duplicate-name message, and `get_pass` returns an identical `not_found` for any bad token.

### Frontend and web
- **SEC-40** `[A]` No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `document.write` with user-controlled data. Guest names and free text (void reasons, prizes) render escaped everywhere.
- **SEC-41** `[A]` CSV export guards against formula injection for **every** text cell (cells beginning with `=`, `+`, `-`, `@`, tab, or CR). Add unit tests for `csv.ts` with inputs such as `=1+1`, `-cmd`, `@SUM(A1)`, `+1`.
- **SEC-42** `[A]` Route guards are UX only. Confirm nothing sensitive relies on client-side checks alone.
- **SEC-43** `[A]` `localStorage` holds only the pass token (and the last scanner tab). Session tokens are handled by `supabase-js`. Nothing sensitive in URLs except the pass token path.
- **SEC-44** `[B]` Response headers on the live site include `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self)`. `robots.txt` disallows all, and the page has `noindex`. `curl -I` evidence.
- **SEC-45** `[A]` `npm audit --omit=dev`: list high and critical issues. Check the lockfile is committed. No abandoned packages in the dependency list. Production build has no source maps (or report if it does).
- **SEC-46** `[A]` Pass page leaks nothing about other guests. Pass URL `Referrer-Policy` stops the token path being sent to third parties (Turnstile, fonts, analytics). List every third-party request the pages make.

### Privacy
- **SEC-50** `[A+B]` Names and teams are personal data. Confirm only admin can read them (SEC-10 to SEC-12). Note where names leave the system (CSV export, copy to the external wheel site) and report that these are manual admin actions. List what the owner should tell the client about retention and deleting data after the event.

---

## 3. Data integrity and business rules `[A on staging, B read-only]`

Run these on **staging**. For concurrency tests use a small script (Node, k6, or `psql` with parallel sessions). Record the results.

### Registration
- **DATA-01** Duplicate names are rejected case-insensitively and ignoring extra spaces: `Juan Dela Cruz`, `  juan   dela cruz `, `JUAN DELA CRUZ`. Also try the same name with a different team (must still be rejected).
- **DATA-02** Validation: 2 characters, 81 characters, digits, emoji, `<script>`, SQL metacharacters, leading and trailing punctuation, only spaces, empty. All rejected with a friendly message. Accents (`José`, `Peña`) are accepted. Note that `José` and `Jose` are treated as different people (report as a known limitation).
- **DATA-03** Team: missing, `null`, random UUID, an inactive team: all rejected with `invalid_team`. A forged `site` field is ignored. (Phase 9, else `N/A`.)
- **DATA-04** Registration closed (toggle off, and `registration_closes_at` in the past) is enforced server-side, not only in the UI. Test directly against the Edge Function.
- **DATA-05** **Concurrency:** 20 parallel registrations with the same name result in exactly 1 success and 19 `name_exists`. 100 parallel registrations with different names all succeed with unique tokens and backup codes. No 500 errors.
- **DATA-06** **Lost response:** simulate a successful registration whose response never reaches the phone (kill the network after the request is sent). The guest retries and gets `name_exists` with no pass. Document exactly what the guest sees. This is a likely real-world failure at a crowded venue. Rate it, and propose a fix (for example a client-generated request id stored in `localStorage`, with the server returning the existing pass for the same id).

### Check-in
- **DATA-10** First scan succeeds. Second returns `already_checked_in` with the time. Voided guest rejected. Not found rejected. `checkin_open = false` or past `checkin_closes_at` blocks staff but not admin. `raffle_locked` blocks everyone.
- **DATA-11** The methods `scan`, `code`, and `manual` are all logged correctly. Invalid `p_method` values fall back safely.
- **DATA-12** **Concurrency:** 10 parallel check-ins of the same guest produce exactly 1 success and 9 `already_checked_in`.

### Claims (cocktail and Bundle of Joy)
- **DATA-20** Claim before check-in is rejected (`not_checked_in`). Claim after check-in succeeds once per station. A second claim returns `already_claimed` with the time. A disabled station rejects.
- **DATA-21** **Concurrency:** 10 parallel claims of the same guest and station produce exactly 1 row in `claims`.
- **DATA-22** Cocktail and Bundle are independent: claiming one does not affect the other.

### Void, undo, raffle
- **DATA-30** Void guest: rejected everywhere afterward. Restore works. Reason required. All logged.
- **DATA-31** Undo check-in is blocked when claims or an active win exist. Undo claim works and frees the claim.
- **DATA-32** `raffle_pool` contains only checked-in, non-voided guests who do not hold an active win. Cross-check: pool count equals a raw SQL count of the same rule.
- **DATA-33** `record_winner` accepts only guests in the pool. Absent winner voided with "put back" off stays out of the pool. With "put back" on, returns. A voided guest never enters the pool.
- **DATA-34** `raffle_locked` blocks check-in for staff and admin, and unlocking restores it.
- **DATA-35** The "Copy raffle names" output has exactly the same number of names as the pool counter, one per line, no blank lines, no trailing spaces.

### Numbers and teams
- **DATA-40** Dashboard numbers equal raw SQL counts: registered, eligible, cocktail claimed, bundle claimed, not checked in, voided, winners. Voided guests are excluded from claim counts.
- **DATA-41** Phase 9: `team_stats` rows add up to `dashboard_stats` for registered, eligible, cocktail, and bundle (including the "Unassigned" row). All 23 teams are listed in the specified order and spelling. Site always matches the team (Toledo has 21 teams, Talisay has 2).
- **DATA-42** Guests page: team filter, site filter, search, status filter, and pagination combine correctly. Total count matches. Changing a filter resets to page 1. Filter state survives a refresh.

### Logs and time
- **DATA-50** Every state-changing action writes exactly one log row with the right actor, action, guest, station, method, and result. Rejected attempts are logged too.
- **DATA-51** **Time zone:** every displayed time is `Asia/Manila`. Set the test browser/OS to UTC and then to `America/New_York`: displayed times and the date-time inputs in Settings must still mean Manila time. Test the exact cutoff boundary (one second before and after `registration_closes_at`).

---

## 4. Performance `[A on staging/local, B on live]`

Record **measured numbers** with the tool and device profile used. Do not guess.

### Page weight and speed (Lighthouse mobile, simulated Slow 4G; see Appendix C)
- **PERF-01** `/register`: JS transferred (gzip) at most about **220 KB**, LCP at most **2.5 s**, performance score at least **90**, accessibility at least **95**, CLS under 0.1. Report actuals even if they pass.
- **PERF-02** `/g/:token` (pass page): same targets.
- **PERF-03** `/scan` and `/login` and one admin page: report numbers (no hard target, but admin and scanner code must **not** be in the `/register` bundle).
- **PERF-04** Code splitting: route-level lazy loading in place. `qr-scanner` loads only on `/scan`. Turnstile loads only on `/register`. Admin code never ships to guests. Use a bundle analyzer (for example `rollup-plugin-visualizer`) and list the 10 largest chunks and dependencies.
- **PERF-05** Fonts: only the needed weights and latin subset, `font-display: swap`, self-hosted. No images heavier than a few KB on guest pages.
- **PERF-06** Request waterfall on `/register`: list every request. Expected: `get_public_settings`, `get_teams`, Turnstile, and the register call. Flag anything extra. No polling on guest pages (the pass page refetches on focus and on button press only).

### Database
- **PERF-10** On staging with **5,000 dummy guests** (Appendix A generator), time the SQL behind `search_guests`, the `guest_overview` page query (with and without team filter and search), `team_stats`, `dashboard_stats`, and `raffle_pool` using `EXPLAIN (ANALYZE, BUFFERS)`. Targets: each under about 100 ms. Report plans that use sequential scans on large tables and say whether it matters at 5,000 rows (the name search uses `strpos`, a trigram index only matters if it is slow).
- **PERF-11** Confirm indexes exist for the access paths used (`guests.team_id`, `guests.checked_in_at`, `guests.created_at`, unique indexes, `claims(guest_id, station)`). List missing or unused indexes.
- **PERF-12** No N+1 patterns in the frontend (per-row requests inside lists). Report request counts for the dashboard, Guests, Raffle, and Logs pages.
- **PERF-13** Dashboard polling: every 5 seconds only while the tab is visible, paused when hidden, one combined request where possible. Compute load for 3 admin tabs open for 6 hours and report the request total.

### Load test on staging (Appendix D)
- **PERF-20** **Anon read burst:** 300 virtual users ramping over 2 minutes calling `get_public_settings` and `get_teams`. Targets: error rate under 1%, p95 under 800 ms.
- **PERF-21** **Registration burst** (staging function with the Cloudflare **test** Turnstile secret): 300 registrations over 120 seconds, then a spike of 100 within 10 seconds. Targets: error rate under 1%, p95 under 1.5 s, no duplicate tokens or codes, row count equals successes. Record the Edge Function cold-start latency of the first call. Names must be letters only to pass validation, so generate them with a base-26 letter mapping.
- **PERF-22** **Scanning load:** 3 entrance staff scanning one guest every 2 seconds each, plus 2 booths and 3 admin dashboards polling, for 10 minutes. Targets: p95 RPC under 500 ms, zero errors.
- **PERF-23** Watch the Supabase dashboard during all load tests (CPU, memory, connections, Edge Function invocations). Record peaks and any 429 or 5xx responses. State whether the free tier has enough headroom for 300+ guests and by what margin.
- **PERF-24** Latency from the Philippines: project region (Singapore `ap-southeast-1` is closest) and measured round-trip time to the REST API and the Edge Function from a PH network, if available.

### Device performance
- **PERF-30** In Chrome DevTools with 4x CPU slowdown and Slow 4G, the register flow (load, fill, submit, see the pass QR) completes in a reasonable time. Report time to interactive and time to QR visible.
- **PERF-31** Scanner: camera start time, scan-to-result time on a mid-range Android. Leave `/scan` open for 30 minutes: memory stays flat, the camera stream stops on unmount, the wake lock releases, no intervals leak.
- **PERF-32** Large lists: Guests with 5,000 rows is paginated and fast. CSV export of 5,000 rows finishes in under 10 seconds without freezing the tab.

---

## 5. Seamlessness and event-day behavior `[A+B]`

### End-to-end journeys (run on staging, repeat on live with test data in Pass B)
- **UX-01** Guest: scan the QR poster URL, register, screenshot the pass, close the browser, reopen the site (banner "You already registered on this device").
- **UX-02** Entrance: scan the pass, see the green check-in. Scan again, see red "already" with the time.
- **UX-03** Booth: cocktail scan before check-in gives amber "send to entrance". After check-in gives green. Repeat gives red "already claimed". Same for Bundle of Joy.
- **UX-04** Lost QR: staff uses Find Guest, confirms, check-in works. Repeat search shows the right status.
- **UX-05** Camera dead: staff switches to Enter Code, then to Find Guest, without reloading.
- **UX-06** Raffle: admin copies the pool, records a winner, voids an absent winner, copies the pool again, the list updates correctly.
- **UX-07** Admin day-of: open registration and check-in, watch the dashboard update within 5 seconds, close both, export the CSV.

### Failure handling
- **UX-10** **No false success:** with the network off or an RPC error, the scanner must never show green. Unknown response codes must map to a neutral or red state, never green. Review the code that maps result codes to colors.
- **UX-11** Duplicate-scan protection: the same QR held in front of the camera does not fire repeated requests (about 3 second ignore window). Double-tap on submit buttons does not double-submit.
- **UX-12** Session expiry: a staff session left open for 8 hours keeps working (token refresh) or fails with a clear "log in again" message that does not lose state. On staging, shorten the JWT expiry to test this.
- **UX-13** Slow or offline network at registration and at the scanner: clear error text and a retry option, no blank screens.
- **UX-14** Every screen has loading, empty, and error states.

### Devices and browsers
- **UX-20** Test matrix, each with notes: iOS Safari (current and one version back), Chrome on Android (low-end), Samsung Internet, **Facebook and Messenger in-app browsers** (guests may open the link from a shared post or chat), desktop Chrome and Firefox for admin.
- **UX-21** In-app browsers: registration works (Turnstile loads, form submits, pass renders), and the `localStorage` token is saved or fails gracefully.
- **UX-22** **Forced dark mode** (Samsung and Android force-dark, iOS dark): the pass QR must stay black on white and scannable. Check the page declares a light color scheme. Scan a screenshot of the pass from a second phone at low brightness.
- **UX-23** Layout at 360px, 390px, 768px, and 1280px for every screen. No horizontal scroll, no clipped buttons, notch and safe areas respected. Touch targets at least 44px. Inputs at least 16px (no iOS zoom on focus).
- **UX-24** Clipboard: "Copy raffle names" and "Copy credentials" work on iOS Safari and Android Chrome, with a working fallback.
- **UX-25** Date-time inputs in Settings work on iOS and Android and are interpreted as Manila time.
- **UX-26** Accessibility: labels on every input, `aria-label` on icon-only buttons, focus order, visible focus ring, text contrast at least 4.5:1, usable at 200% font size, keyboard-operable admin. Lighthouse accessibility at least 95 on every page type.

---

## 6. Code quality and maintainability `[A]`

- **CODE-01** TypeScript strict mode on, no `any`, no `@ts-ignore` without a reason. `tsc --noEmit` and the linter (add ESLint if missing) are clean.
- **CODE-02** No `console.log` of sensitive data. No dead code, unused dependencies, or duplicated logic. List them.
- **CODE-03** Validation parity: client Zod rules and SQL rules for name, team, and password match (same length limits, same allowed characters). Report any mismatch.
- **CODE-04** Error handling: every RPC and Edge Function error code is mapped to a readable message. Unknown errors show a safe generic message.
- **CODE-05** Tests: list existing tests. Recommend a minimal set (unit tests for `csv.ts`, `qr.ts`, the password generator, and name normalization parity, plus SQL tests for the rules in section 3). Do not write them during the audit.
- **CODE-06** Docs are accurate: `supabase/README.md`, `APPLIED.md`, `docs/EVENT_DAY.md`, `.env.example`. A new developer could deploy from them.

---

## 7. Deployment and operations readiness `[B]`

- **OPS-01** Hosting terms: Vercel Hobby is for non-commercial use. This is a paid client project, so confirm the hosting plan or provider allows commercial use (Vercel Pro, or Cloudflare Pages free). Report which is used.
- **OPS-02** Deep links work on refresh: `/g/<token>`, `/admin/guests?team=<id>`, `/scan`, an unknown path (404 page). HTTPS enforced. Custom domain (if any) and the QR poster URL are final.
- **OPS-03** Environment: all `VITE_*` variables set in the host, Edge Function secrets set (`TURNSTILE_SECRET_KEY`, `ALLOWED_ORIGIN`), and the frontend was rebuilt after the last env change.
- **OPS-04** Supabase: project region, pause risk (free projects pause after inactivity), no automatic backups on free. Confirm a manual backup plan: CSV export of guests before and after the event, plus a SQL dump if possible.
- **OPS-05** Monitoring: the owner can see Edge Function logs and errors. Suggest a free uptime check on `/register` for the weeks before the event.
- **OPS-06** Rollback: describe how to roll back the frontend (previous deployment). SQL changes are forward-only, so list what a bad migration would require.
- **OPS-07** **Feature freeze:** confirm the date after which no changes are deployed (recommended: at least 7 days before the event), and that a staff dry run with real phones happens after the freeze.
- **OPS-08** Walk `docs/EVENT_DAY.md` line by line. Check it matches the final app (staff creation method, team list, settings to open and close, who does what) and add the go or no-go checklist from section 10.

---

## 8. Report deliverable

Write `docs/audit/report.md` with:

1. **Executive summary:** go, conditional go, or no-go for Dec 19, the top 5 risks, and counts by severity.
2. **Results table:** every check ID, status, severity (if FAIL), one-line evidence.
3. **Findings:** for each finding: ID, severity, area, evidence (file and line, query, command output), impact in event terms, recommended fix, effort (S, M, L).
4. **Measurements:** tables for Lighthouse, bundle sizes, query timings, and load-test results (tool, parameters, numbers).
5. **Not verified:** everything marked `CANNOT VERIFY` and the manual checks in Appendix E.
6. **Recommended fix order:** Blockers, then High, then Medium, then Low, with dependencies noted.
7. **Regression checklist:** the exact checks to re-run after fixes.

Then **stop** and wait for the owner.

## 9. Fix pass (only after the owner approves)

- Fix one finding at a time, starting with Blockers. One commit per finding, referencing its ID.
- SQL fixes go in **new numbered files**, never edits to applied files, and are logged in `supabase/APPLIED.md`.
- After each fix, re-run the related checks and update the report status. Run the full regression checklist before declaring the audit closed.

## 10. Go / no-go criteria

**Go** only if all are true:
- No open Blocker or High findings.
- SEC-10 to SEC-13 pass on production.
- DATA-05, DATA-12, DATA-21 pass (no double claims or duplicate registrations under concurrency).
- PERF-20 to PERF-22 meet their targets on staging with at least 20% headroom, or the owner has accepted the risk in writing.
- UX-01 to UX-07 pass on real phones (one iPhone and one low-end Android at minimum).
- A staff dry run was completed, and `docs/EVENT_DAY.md` was walked end to end.

---

## Appendix A — Read-only verification queries (Supabase SQL Editor)

Run on production and staging. These do not change data.

```sql
-- RLS status of every table
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;

-- Table privileges for the API roles (anything for anon should be intentional)
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
order by grantee, table_name, privilege_type;

-- Column privileges on guests (token and backup_code must NOT appear for authenticated or anon)
select grantee, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'guests' and grantee in ('anon', 'authenticated')
order by grantee, column_name;

-- Function execute rights. Expect anon = true only for get_public_settings, get_pass, get_teams.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_exec,
       p.proconfig as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;

-- SECURITY DEFINER functions without a fixed search_path (expect zero rows)
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and (p.proconfig is null
       or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'));

-- Policies
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- Views must be security_invoker
select c.relname, c.reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v';

-- Indexes
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- Raw counts to compare with the dashboard (these bypass the admin check)
select
  count(*) as registered,
  count(*) filter (where checked_in_at is not null and not voided) as eligible,
  count(*) filter (where checked_in_at is null and not voided) as not_checked_in,
  count(*) filter (where voided) as voided
from public.guests;
```

**Staging only — dummy guest generator (5,000 rows):**

```sql
with t as (select array_agg(id order by sort_order) as ids from public.teams)
insert into public.guests (name, name_normalized, token, backup_code, team_id)
select 'ZZ Test ' || g,
       lower('zz test ' || g),
       encode(extensions.gen_random_bytes(10), 'hex'),
       upper(lpad(to_hex(g), 6, '0')),
       t.ids[1 + (g % array_length(t.ids, 1))]
from generate_series(1, 5000) as g, t;

-- Staging cleanup
delete from public.claims  where guest_id in (select id from public.guests where name like 'ZZ Test %');
delete from public.winners where guest_id in (select id from public.guests where name like 'ZZ Test %');
delete from public.guests  where name like 'ZZ Test %';
```

If the project has no `teams` table yet (Phase 9 not applied), drop the `team_id` column from the insert.

## Appendix B — Access tests with curl (set `SUPABASE_URL` and `ANON_KEY` in your shell)

```bash
# Anon must not read any table or view. Any returned row is a Blocker.
for t in guests staff settings claims winners activity_logs teams raffle_pool guest_overview; do
  echo "== $t"
  curl -s "$SUPABASE_URL/rest/v1/$t?select=*&limit=1" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
  echo
done

# Anon must be denied on every non-public RPC (expect permission denied or function not found).
for f in dashboard_stats team_stats search_guests check_in_guest claim_station void_guest \
         restore_guest undo_check_in undo_claim record_winner void_winner log_admin_action \
         register_guest_internal resolve_guest write_log; do
  echo "== $f"
  curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/$f" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" -d '{}'
  echo
done

# Allowed anon RPCs (expect 200)
for f in get_public_settings get_teams; do
  curl -s -o /dev/null -w "$f %{http_code}\n" -X POST "$SUPABASE_URL/rest/v1/rpc/$f" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" -d '{}'
done

# Edge Function: wrong method, missing Turnstile token
curl -s -i -X GET  "$SUPABASE_URL/functions/v1/register-guest" -H "Authorization: Bearer $ANON_KEY" | head -n 1
curl -s -X POST "$SUPABASE_URL/functions/v1/register-guest" \
  -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Test Person"}'

# Repeat the table and RPC loops using a STAFF user's JWT in the Authorization header
# (log in on staging, copy the access token into STAFF_JWT).
```

## Appendix C — Lighthouse

```bash
npx lighthouse "https://<domain>/register" --form-factor=mobile \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json --output-path=./docs/audit/lighthouse-register.json \
  --chrome-flags="--headless"
```

Repeat for `/g/<test-token>`, `/login`, and (logged in, via DevTools) `/scan` and `/admin`. Run each three times and report the median. Also record results with DevTools CPU 4x slowdown.

## Appendix D — Load test outline (k6, staging only)

```js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '60s', target: 300 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
};

const H = {
  apikey: __ENV.ANON_KEY,
  Authorization: `Bearer ${__ENV.ANON_KEY}`,
  'Content-Type': 'application/json',
};

export default function () {
  const s = http.post(`${__ENV.SUPABASE_URL}/rest/v1/rpc/get_public_settings`, '{}', { headers: H });
  const t = http.post(`${__ENV.SUPABASE_URL}/rest/v1/rpc/get_teams`, '{}', { headers: H });
  check(s, { 'settings 200': (r) => r.status === 200 });
  check(t, { 'teams 200': (r) => r.status === 200 });
  sleep(1);
}
```

Registration scenario: POST to the staging `register-guest` function with `{ name, team_id, turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' }` and the Cloudflare **test** secret configured on staging so the token passes. Names must be letters only (the validator rejects digits), so build them from a base-26 letter encoding of the VU and iteration numbers. Registration must be open on staging. Scanning scenario: authenticate as staff users on staging and call `check_in_guest` and `claim_station` with tokens of the dummy guests.

## Appendix E — Checks only a human can do (report as `CANNOT VERIFY` and hand to the owner)

- Real phone camera scanning: a screenshot of the pass from a second phone, low brightness, cracked or dirty screens.
- The printed QR poster: size (at least 5×5 cm), contrast, scans from 1 meter on cheap phones.
- Venue network: 300 phones on the venue wifi versus mobile data, and the staff phones' signal at the entrance and booths.
- Battery and power: staff phones on chargers or power banks for the whole event.
- A full staff dry run with the real people and devices, including the help desk flow.
- Client sign-off on the team list spelling and the rules printed on the poster and the form ("Must be present to win").

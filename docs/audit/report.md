# KJBA Pass — Pass A Audit Report

**Audit date:** 2026-11-21  
**Scope:** Pass A only (`[A]` and `[A+B]` checks; `[B]`-only checks are not run).  
**Mode:** Read-only. No application code, SQL, or configuration was changed.  
**Event:** Safelinks Christmas Party, Dec 19, 2026, Toledo Megadome Sports Center.

## Fix pass — 2026-11-23

Code fixes applied after owner approval. Runtime and device checks remain manual.

| Finding | Severity | Fix |
|---|---|---|
| F-10 | High | Scanner clears the previous result before every RPC (`scanner-page.tsx`). |
| F-07 | High | `record_winner` locks the guest, re-checks the pool, and a partial unique index enforces one active win (`13_audit_fixes.sql`). |
| F-05 | Medium | Zod and SQL require at least one letter in guest names. |
| F-08 | Medium | Checked-in filter excludes voided guests. |
| F-03 | Medium | `register-guest` rejects bodies over 4 KB before parsing. |
| F-06 | Medium | Client request id + `guests.request_id` replay returns the original pass on retry. |
| F-09 | Medium | Disabled-station claims are logged; client and Edge audit writes are checked. |
| F-13 | Medium | `dashboard_snapshot()` serves stats, teams, and recent activity in one call. |
| F-11 | Medium | Routes, layouts, and guards are lazy; guest pages use plain fetch instead of supabase-js. Initial preload ~113 KB gzip, `/register` ~210 KB. |

Not fixed: F-01, F-02, F-04, F-12, F-14, F-15 (Low). Staging, load, and device checks stay `CANNOT VERIFY` until the owner runs them.

## 1. Executive summary

**Verdict: NO-GO today. Conditional go only after the two High findings are fixed and the unverified staging/security checks pass.**

No Blocker was proven statically. Two High findings are open:

1. **UX-10** — a failed scanner RPC can leave the previous green success card on screen, a false success at the door.
2. **DATA-33** — two concurrent `record_winner` calls can record the same guest twice; there is no unique/atomic winner guard.

The largest uncertainty is **SEC-10 through SEC-13**: the staging URL/anon key were not present in the audit shell, so anon/staff access, station lock, and deactivated-staff behavior were not exercised. Static SQL looks correctly locked down, but that is not a substitute for the runtime tests.

| Severity | Count |
|---|---:|
| Blocker | 0 proven |
| High | 2 |
| Medium | 7 |
| Low | 6 |
| Total findings | 15 |

**Top five event risks**

1. **Anon/staff access is unverified** (SEC-10–13). If any runtime grant differs from the SQL files, guest data or admin actions could be exposed.
2. **False scanner success** (UX-10). A network/RPC error after a prior success can leave a green card visible.
3. **Duplicate raffle winner** (DATA-33). Two admin sessions can both record the same guest.
4. **Lost registration response** (DATA-06). The guest is inserted, but a retry returns `name_exists` and no pass; the help desk must recover them.
5. **Slow guest load and polling** (PERF-01/PERF-13). Initial `/register` JS is ~270 KB gzip, above the ~220 KB target; three dashboard tabs create ~38,880 requests over six hours.

## 2. Results table

### Inventory and build

| ID | Status | Severity | Evidence |
|---|---|---|---|
| INV-01 | PASS | — | Routes, screens, tables, views, RPCs, Edge Functions, and SQL files inventoried. All planned routes exist. Phase 8 (staff management) and Phase 9 (teams) are built. One plan deviation: registration uses the shared `SelectField`, not the plan’s native `<select>` (F-02). |
| INV-02 | CANNOT VERIFY | — | `supabase/APPLIED.md` says `no` for every SQL file. Applied state cannot be read from the repo; Appendix A must be run by the owner. |
| INV-03 | PASS | — | SQL lives in numbered files `01`–`12` plus `99_verify.sql`; templates are explicitly outside the run order (`supabase/README.md`). No application code depends on an unsaved dashboard-only change found. |
| INV-04 | FAIL | Low | `npm ci` failed with Windows `EPERM` unlinking `lightningcss.win32-x64-msvc.node` and `rolldown-binding.win32-x64-msvc.node`. `npm install --no-package-lock --no-audit --no-fund` restored `node_modules`; `npm run build`, `tsc --noEmit`, and `oxlint` then passed. |

### Security

| ID | Status | Severity | Evidence |
|---|---|---|---|
| SEC-01 | PASS | — | Repo/history filename scans found no JWT-like strings or private keys outside excluded env files. `service_role` text appears only in docs, Edge Function code, and SQL grants. `git log --all -S SUPABASE_SERVICE_ROLE_KEY` shows only commits `b987be2` and `2be01d7`; no literal key was found in the working tree or `dist/`. |
| SEC-02 | PASS | — | `grep -rIlE 'SUPABASE_SERVICE_ROLE_KEY|TURNSTILE_SECRET_KEY|service_role|eyJ...' dist` returned no files. Only the anon key and Turnstile site key belong in the bundle. |
| SEC-03 | PASS | — | `.env` and `.env.local` are ignored (`.gitignore:26-27`) and not tracked. `.env.example` is tracked with empty values; it has a stray `[TEMPLATE]` line (Nit). |
| SEC-04 | NOT RUN (Pass B) | — | B-only check. |
| SEC-05 | NOT RUN (Pass B) | — | B-only check; needs Supabase Auth and production user list. |
| SEC-10 | CANNOT VERIFY | — | Static evidence: `09_grants.sql:1` revokes all table grants from `anon`; `12_teams.sql:14` revokes `teams`; no anon table/view grant exists. Runtime anon REST tests were not run because staging credentials were missing. |
| SEC-11 | CANNOT VERIFY | — | Static evidence: `09_grants.sql:22-23` grant anon only `get_public_settings` and `get_pass`; `12_teams.sql:273` adds `get_teams`; no anon execute grant for internal/admin functions. Runtime denied/allowed matrix not run. |
| SEC-12 | CANNOT VERIFY | — | No non-admin staff JWT was provided. Static evidence: `05_rls.sql:15-17` allows staff to read only their own `staff` row; no staff policy on guests/claims/winners/logs; `09_grants.sql:12` grants selective guest columns without `token`/`backup_code`. |
| SEC-13 | CANNOT VERIFY | — | No staff JWT, deactivated staff JWT, or staging project was available. Static evidence: `07_functions_staff.sql:10-12` and `:71-75` call `can_act_at`; inactive staff fail because `can_act_at` checks `s.active`. |
| SEC-14 | PASS | — | Every `security definer` function found has an explicit `search_path` (grep of `supabase/sql/03`–`12`). Admin/staff functions check role at the top; public functions are intentionally public. Internal helpers (`resolve_guest`, `write_log`, `generate_token`, `generate_backup_code`, `normalize_name`) have no execute grant to anon/authenticated because `09_grants.sql:3-5` revokes all and default privileges. |
| SEC-15 | PASS | — | `get_pass` returns the token holder’s own token/backup code (`06_functions_public.sql:73-94`); `register_guest_internal` returns a new pass to the service role only (`12_teams.sql:71-132`). `search_guests`, `guest_overview`, `raffle_pool`, `team_stats`, and logs return no token or backup code. |
| SEC-16 | PASS | — | RLS is enabled on six base tables (`05_rls.sql:1-6`) and `teams` (`12_teams.sql:13`). Both views use `security_invoker = true` (`04_views.sql:4`, `:17`; `12_teams.sql:202`). Policies: settings admin select/update; staff self/admin select and admin update; guests/claims/winners/logs admin select; teams admin select. |
| SEC-17 | CANNOT VERIFY | — | Static evidence: `02_tables.sql:81-93` defines the append-only trigger and raises `activity_logs is append-only`. Runtime update/delete attempts as service role/admin were not run; no staging service access. Logs reviewed contain no tokens, backup codes, or passwords. |
| SEC-20 | FAIL | Medium | `register-guest/index.ts:51-53` parses JSON before applying any body-size limit. It validates name length and types, but a large body is parsed first. By contrast, `manage-staff/index.ts:6,60-62` has a 4 KB content-length guard. Non-POST, invalid types, and Turnstile ordering are otherwise correct. |
| SEC-21 | CANNOT VERIFY | — | Static evidence: `register-guest/index.ts:8-21,36-40` and `manage-staff/index.ts` use exact `ALLOWED_ORIGIN` matching; no wildcard. Runtime origin matrix not run. |
| SEC-22 | PASS | — | `src/lib/supabase.ts:5-11` creates the frontend client with the anon key. Service-role clients exist only inside `register-guest` and `manage-staff`. Console output in `register-guest/index.ts:105,109,130` contains only status/error codes, not bodies, tokens, or keys. |
| SEC-23 | PASS | — | `manage-staff/index.ts` verifies an active admin (`:63-88`), hardcodes created role to `staff` (`:166-172`), rejects admin reset/deactivate targets (`:240-247`, `:284-291`), cleans up orphan Auth users (`:180-199`), and never logs passwords. |
| SEC-30 | PASS | — | `generate_token` uses `gen_random_bytes(10)` = 80 bits (`03_helpers.sql:31-33`). Backup code is six characters from a 31-character alphabet (≈29.7 bits) and is only accepted by staff-gated RPCs through `resolve_guest`; `get_pass` only accepts the 80-bit token. |
| SEC-31 | PASS | — | `get_pass` returns the same `{ ok:false, code:'not_found' }` for any bad token (`06_functions_public.sql:79-81`). The only intentional existence disclosure is registration’s duplicate-name message. |
| SEC-40 | PASS | — | `grep` found no `dangerouslySetInnerHTML`, `innerHTML`, `eval(`, `document.write`, or `new Function` in `src`. Guest names, reasons, prizes, and team names are rendered through JSX text nodes. |
| SEC-41 | FAIL | Low | `src/lib/csv.ts:5` guards only `=`, `+`, `-`, and `@`. A Node check showed tab (`"\tcmd"`) and CR (`"\rcmd"`) are not guarded. No unit tests exist for `csv.ts`. Formula injection is constrained today because the name regex rejects control characters, but the export helper does not meet the stated rule. |
| SEC-42 | PASS | — | `RequireRole` (`src/features/auth/require-role.tsx`) is client-side UX only; real access is enforced by RLS and RPC role checks. Admin pages query tables/views backed by admin-only policies. |
| SEC-43 | PASS | — | `localStorage` use is limited to `kjba_pass_token` (`register-page.tsx:40,48`) and `kjba_scanner_tab` (`scanner-page.tsx:39,131`). Supabase session persistence is handled by `supabase-js`. The pass token is intentionally in `/g/:token`. |
| SEC-44 | NOT RUN (Pass B) | — | B-only headers/robots/live-site check. `vercel.json` and `index.html` contain the intended static configuration. |
| SEC-45 | PASS | — | `npm audit --omit=dev`: 0 high, 0 critical, 4 moderate (`@ts-morph/common`, `minimatch`, `shadcn`, `ts-morph`). `package-lock.json` is tracked. No `.map` files in `dist/`. Unused dependencies noted in F-14. |
| SEC-46 | PASS | — | `get_pass` only returns one token’s pass; there is no list endpoint on the pass page. No analytics or third-party requests were found on `/g/:token`; the only external service call is Supabase. Turnstile loads only on registration. `vercel.json` sets `Referrer-Policy: strict-origin-when-cross-origin`, so the token path is not sent cross-origin. |
| SEC-50 | CANNOT VERIFY | — | Static SQL keeps guest/team reads admin-only (`05_rls.sql:22`, `12_teams.sql:15-18`). Runtime privacy test was not possible without staging. Names leave via manual CSV export and the external wheel copy; retention/deletion guidance is still an owner decision. |

### Data integrity and business rules

| ID | Status | Severity | Evidence |
|---|---|---|---|
| DATA-01 | CANNOT VERIFY | — | Static evidence: `12_teams.sql:102-115` normalizes and relies on unique `name_normalized`; `02_tables.sql:31` makes it unique. No staging duplicate-name test was run. |
| DATA-02 | FAIL | Medium | The name regex in `register-page.tsx:29` and `12_teams.sql:92` accepts punctuation-only names. A Node check showed `"..."`, `"'''"`, and `".-"` pass the character class; only the length minimum blocks shorter ones. Digits, `<script>`, and SQL metacharacters are rejected; accents pass. |
| DATA-03 | CANNOT VERIFY | — | Static evidence: Edge Function validates UUID (`register-guest/index.ts:61-69`); SQL requires an active team (`12_teams.sql:96-99`). No staging request with missing/random/inactive team was run. |
| DATA-04 | CANNOT VERIFY | — | Static evidence: `12_teams.sql:76-80` checks `registration_open` and `registration_closes_at` server-side. No staging test. |
| DATA-05 | CANNOT VERIFY | — | No staging project or load script. Static evidence: unique `name_normalized` plus retry loop (`12_teams.sql:104-121`); unique token/code with retry. Concurrency result not measured. |
| DATA-06 | FAIL | Medium | Registration has no idempotency key. `register-page.tsx:132-168` sends the request and relies on the response; if the response is lost, a retry reaches `12_teams.sql:112-115` and returns `name_exists` with no pass. The guest must go to the help desk. |
| DATA-10 | CANNOT VERIFY | — | Static evidence: atomic update with `checked_in_at is null` (`07_functions_staff.sql:43-50`); voided/locked/closed paths return distinct codes. No staging runs. |
| DATA-11 | CANNOT VERIFY | — | Static evidence: `p_method` falls back to `scan` (`07_functions_staff.sql:6`, `:67`) and is written to logs. No runtime method test. |
| DATA-12 | CANNOT VERIFY | — | No staging concurrency test. Static evidence: conditional update and row-count check (`07_functions_staff.sql:43-50`). |
| DATA-20 | CANNOT VERIFY | — | Static evidence: `claim_station` rejects unchecked (`07_functions_staff.sql:101-108`), disabled stations (`:81-84`), and duplicate claims via `on conflict do nothing` (`:110-116`). No staging test. |
| DATA-21 | CANNOT VERIFY | — | No staging concurrency test. The unique `(guest_id, station)` constraint (`02_tables.sql:51`) backs the intended behavior. |
| DATA-22 | CANNOT VERIFY | — | No staging test. Claims are keyed by station (`02_tables.sql:51`); independent code paths are visible. |
| DATA-30 | CANNOT VERIFY | — | Static evidence: void/restore RPCs require a reason where applicable and log success (`08_functions_admin.sql:1-45`). No staging test. |
| DATA-31 | CANNOT VERIFY | — | Static evidence: `undo_check_in` blocks claims and active wins (`08_functions_admin.sql:56-69`); `undo_claim` deletes the claim. No staging test. |
| DATA-32 | CANNOT VERIFY | — | Static view rule is correct (`04_views.sql:4-15`). Pool count was not cross-checked against raw rows on staging. |
| DATA-33 | FAIL | High | `08_functions_admin.sql:124-132` checks the pool with `exists` and then inserts, with no unique constraint on `winners.guest_id` (`02_tables.sql:56-67`). Two concurrent admin calls can both pass the check and insert two active wins. |
| DATA-34 | CANNOT VERIFY | — | Static evidence: `raffle_locked` is checked before check-in success (`07_functions_staff.sql:31-38`) and blocks admin too. No staging test. |
| DATA-35 | CANNOT VERIFY | — | Static evidence: `copyNames` fetches `raffle_pool` and joins names with `\n` (`raffle-page.tsx:221-236`). No clipboard test on staging/device. |
| DATA-40 | CANNOT VERIFY | — | Raw SQL counts were not run on staging. Static `dashboard_stats` definitions are visible in `08_functions_admin.sql:171-195`. |
| DATA-41 | CANNOT VERIFY | — | No staging 23-team dataset/count comparison. Static `team_stats` includes all teams plus Unassigned (`12_teams.sql:224-270`). |
| DATA-42 | FAIL | Medium | `guests-page.tsx:282` filters `checked_in` with only `checked_in_at is not null`; it does not exclude `voided`. A checked-in-then-voided guest appears under “Checked in” while the badge says “Voided”. |
| DATA-50 | FAIL | Medium | Audit gaps found: `claim_station` returns `station_disabled` without `write_log` (`07_functions_staff.sql:81-84`); settings and raffle log calls are fire-and-forget (`settings-page.tsx:78`, `raffle-page.tsx:256,374`); `manage-staff` ignores audit insert errors (`manage-staff/index.ts:93,201,240,253,284,327`). |
| DATA-51 | CANNOT VERIFY | — | Timezone formatting is Manila-based (`src/lib/format.ts:1-41`) and settings converts to/from `+08:00` (`settings-page.tsx:10-18`). No browser/OS UTC/New York test was run. |

### Performance

| ID | Status | Severity | Evidence |
|---|---|---|---|
| PERF-01 | FAIL | Medium | Initial `/register` JS from `dist/index.html` preloads: `index` 182,284 B gzip + `supabase` 73,981 + `format` 9,168 + `stateAttributesMapping` 4,389 + `chevron-down` 182 + runtime 397 = **270,401 B gzip**; CSS adds 12,235 B. Target is about 220 KB. LCP not measured. |
| PERF-02 | FAIL | Medium | The pass route uses the same initial `index.html` payload (270,401 B JS gzip); it exceeds the same ~220 KB JS target. LCP/score not measured. |
| PERF-03 | CANNOT VERIFY | — | Route chunks measured: scanner 9,617 B gzip, guests 18,644, dashboard 3,844, staff 5,321, raffle 5,616, logs 2,400, settings 1,809, login 1,184. No Lighthouse/LCP because no staging/live URL. |
| PERF-04 | PASS | — | `routes.tsx` lazy-loads login, scanner, and every admin page. `qr-scanner` is isolated to `scanner-page`/`scan-panel`; Turnstile is imported by the registration page only. `qr-scanner-worker` is a separate 10,381 B gzip chunk. No bundle visualizer installed; build output used instead. |
| PERF-05 | FAIL | Low | `src/index.css:4` imports the default Inter variable package; `dist` contains Latin, Latin-ext, Cyrillic-ext, Cyrillic, Greek, Greek-ext, and Vietnamese WOFF2 files. Guest layout uses `safelinksLogo` 114,186 B and `logoKjba` 66,527 B, both larger than “a few KB”. |
| PERF-06 | PASS | — | Static `/register` request set: `get_public_settings` (`usePublicSettings.ts:9`), `get_teams` (`register-page.tsx:81`), Turnstile, and `register-guest` on submit. No polling on guest pages; pass page refetches on focus/manual (`pass-page.tsx:41-46`). Network waterfall not measured. |
| PERF-10 | CANNOT VERIFY | — | No staging project, no 5,000-row generator run, no `EXPLAIN (ANALYZE, BUFFERS)`. |
| PERF-11 | PASS | — | Indexes exist for `guests.checked_in_at`, `guests.created_at`, `claims(guest_id, station)` unique, `winners.guest_id`, and `teams(site, sort_order)`; `guests.team_id` is added in `12_teams.sql:21`. Usage/unused-index evidence not available without EXPLAIN. |
| PERF-12 | PASS | — | No per-row fetch loops found in dashboard, guests, raffle, or logs; each page uses one or a small fixed number of queries. Dashboard has 2 stats RPCs + 1 activity query per poll. |
| PERF-13 | FAIL | Medium | Dashboard polls 3 requests every 5 s while visible (`dashboard-page.tsx:247-260,263-275`). 6 h = 4,320 cycles; 3 tabs × 4,320 × 3 = **38,880 requests**. The two stats RPCs are not combined. |
| PERF-20 | CANNOT VERIFY | — | No staging/load tool provided. |
| PERF-21 | CANNOT VERIFY | — | No staging, test Turnstile secret, or registration load script. |
| PERF-22 | CANNOT VERIFY | — | No staging staff JWTs or k6 setup. |
| PERF-23 | CANNOT VERIFY | — | No Supabase dashboard access/monitoring data. |
| PERF-24 | CANNOT VERIFY | — | No Philippines network measurement. |
| PERF-30 | CANNOT VERIFY | — | No browser/device test. |
| PERF-31 | CANNOT VERIFY | — | No mid-range Android or 30-minute scanner soak. |
| PERF-32 | CANNOT VERIFY | — | No 5,000-row staging dataset or 5,000-row CSV test. |

### Seamlessness

| ID | Status | Severity | Evidence |
|---|---|---|---|
| UX-01 | CANNOT VERIFY | — | Requires staging + browser/device journey. Static banner exists (`register-page.tsx:190-201`). |
| UX-02 | CANNOT VERIFY | — | Scanner result mapping is static (`result-card.tsx:35`); no real QR test. |
| UX-03 | CANNOT VERIFY | — | No booth/device test. |
| UX-04 | CANNOT VERIFY | — | No Find Guest device test. |
| UX-05 | CANNOT VERIFY | — | No camera-denied device test. |
| UX-06 | CANNOT VERIFY | — | No raffle journey test. |
| UX-07 | CANNOT VERIFY | — | No admin day-of run. |
| UX-10 | FAIL | High | `scanner-page.tsx:66-90` clears `rpcError` but not `result` on RPC error. A previous green result (`result.ok`) remains rendered by `ResultCard` (`result-card.tsx:35`). On code/find tabs the previous result is not auto-cleared, so it can remain until dismissal/tab change. |
| UX-11 | PASS | — | Scanner pauses 2.5 s after a scan and ignores the same value for 3 s (`scanner-page.tsx:103-115`); submit buttons use `pending`/`isSubmitting` guards. Runtime device behavior not tested. |
| UX-12 | CANNOT VERIFY | — | No 8-hour/short-JWT staging test. |
| UX-13 | CANNOT VERIFY | — | No throttled/offline test. Static error text exists on register and scanner. |
| UX-14 | CANNOT VERIFY | — | Loading/empty/error states exist in several pages, but no full screen matrix/device pass was run. |
| UX-20 | CANNOT VERIFY | — | No device/browser matrix. |
| UX-21 | CANNOT VERIFY | — | No Facebook/Messenger in-app browser test. |
| UX-22 | CANNOT VERIFY | — | `index.css:9` declares `color-scheme: light`; QR uses explicit black/white (`pass-page.tsx:104-114`). No forced-dark device/screenshot scan. |
| UX-23 | CANNOT VERIFY | — | No 360/390/768/1280 browser checks. Static safe-area padding exists (`index.css:80-81`). |
| UX-24 | CANNOT VERIFY | — | Clipboard fallback exists (`raffle-page.tsx:240-252`), but no iOS/Android test. |
| UX-25 | CANNOT VERIFY | — | No iOS/Android datetime input test. |
| UX-26 | CANNOT VERIFY | — | No Lighthouse accessibility or manual keyboard/200% test. Static labels/aria-labels are present in many places; not fully audited. |

### Code quality

| ID | Status | Severity | Evidence |
|---|---|---|---|
| CODE-01 | PASS | — | `tsconfig.app.json` has `"strict": true`; `tsc --noEmit` exits 0; `grep` found no `any`, `@ts-ignore`, or `@ts-expect-error` in `src`. `oxlint`: 0 errors, 3 warnings (`AddStaffDialog.tsx:55`, `button.tsx:57`, `logs-page.tsx:77`). |
| CODE-02 | FAIL | Low | No sensitive `console` output in `src`; Edge Function logs are non-secret. Unused dependencies/assets found: `@fontsource-variable/geist`, `@remixicon/react`, `react-aria-components`, `src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg`. |
| CODE-03 | PASS | — | Name limits/character class match client and SQL (both have the punctuation-only gap in DATA-02). Team is UUID client-side and active-team SQL-side. Password is 10–72 in both `ResetPasswordDialog`/`AddStaffDialog` and `manage-staff`. |
| CODE-04 | PASS | — | Staff API maps known error codes (`src/features/admin/staff/api.ts:72-94`); scanner/guest/admin pages use safe generic messages for unknown/network errors. |
| CODE-05 | PASS | — | No test files exist (`find src ... test/spec` returned none). Recommended minimum: `csv.ts` formula cases, `qr.ts`, `generatePassword`, name-normalization client/SQL parity, and SQL tests for the DATA rules. |
| CODE-06 | FAIL | Low | `docs/EVENT_DAY.md:64,67,88` says “Copy Eligible Names,” “enter guest name,” and “Export CSV”; current UI says “Copy raffle names,” uses an Add winner guest dropdown, and labels the button “Export all (CSV).” `supabase/APPLIED.md` remains all “no.” |

### Deployment / operations

All OPS checks are `NOT RUN (Pass B)` because there is no live URL, hosting dashboard, Supabase project access, or production deployment evidence.

## 3. Findings

### F-01 — `npm ci` cannot complete on this Windows host

- **Check:** INV-04
- **Severity:** Low (environment, not app code)
- **Evidence:** `npm ci` failed with `EPERM` on native bindings (`lightningcss.win32-x64-msvc.node`, `rolldown-binding.win32-x64-msvc.node`). `npm install --no-package-lock --no-audit --no-fund` restored the tree; no `package.json`/`package-lock.json` diff.
- **Impact:** A clean local/CI install is not reproducible on this host. Production is unaffected.
- **Fix:** Run `npm ci` in a clean CI/container or after closing processes holding native binaries. Do not change dependency versions for this.
- **Effort:** S

### F-02 — Registration team picker deviates from the Phase 9 plan

- **Check:** INV-01
- **Severity:** Low
- **Evidence:** Plan Phase 9.7 specifies a native `<select>` with `<optgroup>`, 52px minimum. Current `src/features/register/register-page.tsx:251` uses the shared `SelectField` for UI consistency.
- **Impact:** None functionally. The plan and code disagree; a future developer may “fix” this in the wrong direction.
- **Fix:** Decide which behavior is authoritative and update the other. If keeping `SelectField`, update plan and acceptance criteria.
- **Effort:** S

### F-03 — `register-guest` has no request body size limit

- **Check:** SEC-20
- **Severity:** Medium
- **Evidence:** `supabase/functions/register-guest/index.ts:51-53` calls `req.json()` before any size check. `name.length > 200` is checked only after parsing (`:67`). `manage-staff` has `MAX_BODY_BYTES = 4096` (`manage-staff/index.ts:6,60-62`).
- **Impact:** A client can force the function to parse a large payload before validation. At a crowded event this is an abuse/DoS surface and wastes Edge Function time.
- **Fix:** Read `content-length` and reject over a small limit before `req.json()`; optionally read text and enforce a byte cap.
- **Effort:** S

### F-04 — CSV formula guard misses tab and carriage return

- **Check:** SEC-41
- **Severity:** Low
- **Evidence:** `src/lib/csv.ts:5` uses `/^[=+\-@]/`. Node check: `"\tcmd"` and `"\rcmd"` returned `false`. No `csv.ts` tests.
- **Impact:** The current name validator rejects control characters, so this is not reachable through normal guest names. It becomes real if team names or future exported text allow tabs/CR. Excel formula injection is a security requirement in the audit.
- **Fix:** Guard `/^[=+\-@\t\r]/` or normalize/prefix all cells; add the requested unit cases.
- **Effort:** S

### F-05 — Punctuation-only guest names pass validation

- **Check:** DATA-02
- **Severity:** Medium
- **Evidence:** `src/features/register/register-page.tsx:29` and `supabase/sql/12_teams.sql:92` allow only letters, spaces, `.`, `-`, and `'`, but do not require a letter. Node test: `"..."`, `"'''"`, and `".-"` pass; `"  "` fails length.
- **Impact:** Fake/junk guest rows can enter the pool and appear on the external wheel, causing confusion at the help desk/raffle.
- **Fix:** Require at least one letter (e.g. `(?=.*[A-Za-zÀ-ÖØ-öø-ÿ])`) in both Zod and SQL; keep the rest of the character class.
- **Effort:** S

### F-06 — Registration is not idempotent when the response is lost

- **Check:** DATA-06
- **Severity:** Medium
- **Evidence:** `register-page.tsx:132-168` sends `{name, team_id, turnstileToken}` with no request id. If the response never arrives, a retry reaches the duplicate-name path in `12_teams.sql:112-115` and returns `name_exists`; no pass is returned.
- **Impact:** The guest is in the DB but has no pass; they must go to the help desk. This is a likely crowded-venue failure.
- **Fix:** Add a client-generated request id stored in `localStorage`, persist it on the guest/request table, and return the existing pass for a retry with the same id.
- **Effort:** M

### F-07 — Winner recording is not atomic against duplicate admin submissions

- **Check:** DATA-33
- **Severity:** High
- **Evidence:** `08_functions_admin.sql:124-132` performs `exists` then `insert`; `winners` has only a non-unique `guest_id` index (`02_tables.sql:56-67`).
- **Impact:** Two admin tabs/devices can both record the same guest. That can produce two active wins/prizes and wrong dashboard/winner counts.
- **Fix:** Serialize per guest in SQL (row lock on the guest or an advisory lock) and/or enforce one active win per guest with a partial unique index/transactional constraint; re-check the pool after locking.
- **Effort:** M

### F-08 — “Checked in” filter includes voided guests

- **Check:** DATA-42
- **Severity:** Medium
- **Evidence:** `guests-page.tsx:282` uses `.not('checked_in_at', 'is', null)` without `.eq('voided', false)`. A voided guest who had checked in appears under “Checked in,” while the row badge says “Voided.”
- **Impact:** Admin counts/filter views are misleading during reconciliation.
- **Fix:** Add `.eq('voided', false)` to the checked-in filter, or define the filter as “ever checked in” and label it accordingly.
- **Effort:** S

### F-09 — Audit logging has silent gaps

- **Check:** DATA-50
- **Severity:** Medium
- **Evidence:** `07_functions_staff.sql:81-84` returns `station_disabled` without a log row. `settings-page.tsx:78`, `raffle-page.tsx:256,374` call `log_admin_action` with `void`/no error handling. `manage-staff/index.ts:93,201,240,253,284,327` ignores audit insert results.
- **Impact:** An action can succeed with no activity row, or a rejected station action is missing from the trail. This weakens the audit trail during disputes.
- **Fix:** Log every rejected path; await and check audit writes; if the audit write fails after a completed mutation, use an outbox/retry path rather than silently succeeding.
- **Effort:** M

### F-10 — Scanner can leave a stale green success card after a failed request

- **Check:** UX-10
- **Severity:** High
- **Evidence:** `scanner-page.tsx:66-90` sets `rpcError` and returns on error, but never clears `result`. `ResultCard` renders green whenever `result.ok` (`result-card.tsx:35`). Code/find tabs do not auto-clear the previous result (auto-clear effect only runs when `tab === 'scan'`, `scanner-page.tsx:120-123`).
- **Impact:** Staff can see green from the previous guest while the current scan/claim actually failed. That can admit or serve a guest without a valid check-in/claim.
- **Fix:** Clear `result` at the start of `act` (before the RPC) or replace it with an explicit error result; never leave a prior success visible while an error banner is active.
- **Effort:** S

### F-11 — Initial guest JS is over the performance target

- **Check:** PERF-01 / PERF-02
- **Severity:** Medium
- **Evidence:** `dist/index.html` preloads `index` 182,284 B gzip, `supabase` 73,981, `format` 9,168, `stateAttributesMapping` 4,389, `chevron-down` 182, runtime 397 = **270,401 B JS gzip**, plus 12,235 B CSS. Target is about 220 KB JS. LCP/score not measured.
- **Impact:** 300 phones hit a heavier-than-planned guest page at once; slower first paint and more data.
- **Fix:** Move non-critical guest code off the initial path, reduce the Supabase/auth surface for `/register`, and measure with Lighthouse on staging.
- **Effort:** M

### F-12 — Fonts and guest logos are heavier than the plan

- **Check:** PERF-05
- **Severity:** Low
- **Evidence:** `src/index.css:4` imports all Inter variable subsets; `dist/assets` includes Latin-ext 85,068 B, Cyrillic-ext 25,960 B, Greek 18,996 B, Cyrillic 18,748 B, Greek-ext 11,232 B, Vietnamese 10,252 B. Guest layout uses `safelinksLogo` 114,186 B and `logoKjba` 66,527 B (`guest-layout.tsx:10,20`).
- **Impact:** Extra font/image bytes on guest pages; larger screenshots and slower LCP on mobile.
- **Fix:** Import only the Latin subset/needed weights, compress/resize the guest logos (WebP/AVIF or SVG), and measure again.
- **Effort:** S

### F-13 — Dashboard polling is three requests per five seconds

- **Check:** PERF-13
- **Severity:** Medium
- **Evidence:** `dashboard-page.tsx:247-260` runs `dashboard_stats` + `team_stats` in `Promise.all`; `:263-275` runs a separate activity query every 5 s. 6 h = 4,320 cycles; 3 tabs × 4,320 × 3 = **38,880 requests**.
- **Impact:** Unnecessary load on Supabase and admin devices during the event; the audit calls for one combined request where possible.
- **Fix:** Add one dashboard snapshot RPC returning stats + teams + recent activity, or stagger/pause the activity query; keep visible-only polling.
- **Effort:** M

### F-14 — Unused dependencies and assets

- **Check:** CODE-02
- **Severity:** Low
- **Evidence:** No imports found for `@fontsource-variable/geist`, `@remixicon/react`, `react-aria-components`; no imports for `src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg`.
- **Impact:** Install/maintenance noise; no direct runtime bundle impact for unused packages.
- **Fix:** Remove unused packages/assets after confirming no planned Board UI use.
- **Effort:** S

### F-15 — Event-day docs do not match current labels/flow

- **Check:** CODE-06
- **Severity:** Low
- **Evidence:** `docs/EVENT_DAY.md:64` says “Copy Eligible Names”; UI says “Copy raffle names” (`raffle-page.tsx:436`). `:67` says enter the guest name under “Record winner”; UI uses an Add winner guest dropdown (`raffle-page.tsx:112-124`). `:88` says “Export CSV”; UI says “Export all (CSV)”.
- **Impact:** Staff following the runbook may hesitate or use the wrong control during the event.
- **Fix:** Update the runbook labels/flow and add the team filter/export controls.
- **Effort:** S

## 4. Measurements

### Build and static checks

| Tool / command | Result |
|---|---|
| `npm run build` (`tsc -b && vite build`) | Passed; Vite warns `index-*.js` is 580.42 kB (184.26 kB gzip) and one chunk exceeds 500 kB. |
| `npx tsc --noEmit` | Passed, no output. |
| `npm run lint` (`oxlint`) | 0 errors, 3 warnings: `AddStaffDialog.tsx:55` (`watch`), `button.tsx:57` (fast-refresh export), `logs-page.tsx:77` (`setState` in effect). |
| `npm ci` | Failed with Windows `EPERM` on native bindings; restored with `npm install --no-package-lock --no-audit --no-fund`. |
| `npm audit --omit=dev` | 0 high, 0 critical, 4 moderate: `@ts-morph/common`, `minimatch`, `shadcn`, `ts-morph`. |
| Secret scans | No JWT-like strings/private keys in repo or `dist`; no `.env`/`.env.local` tracked or in history. |
| Source maps | None in `dist`. |

### Initial guest payload

`dist/index.html` preloads the shared entry and these chunks:

| Asset | Raw bytes | Gzip bytes |
|---|---:|---:|
| `index-B6kPseEe.js` | 580,420 | 182,284 |
| `supabase-NBreicxa.js` | 265,654 | 73,981 |
| `format-BerUAWtd.js` | 26,804 | 9,168 |
| `stateAttributesMapping-CmpWjqq1.js` | 10,887 | 4,389 |
| `rolldown-runtime-WkwZ5CU-.js` | — | 397 |
| `chevron-down-B2HWEqNA.js` | — | 182 |
| **Initial JS total** | — | **270,401** |
| `index-Dt_Wjdqr.css` | 61,723 | 12,235 |

### Route chunks (gzip)

| Route/chunk | Gzip bytes |
|---|---:|
| `guests-page` | 18,644 |
| `scanner-page` | 9,617 |
| `raffle-page` | 5,616 |
| `staff-page` | 5,321 |
| `dashboard-page` | 3,844 |
| `logs-page` | 2,400 |
| `settings-page` | 1,809 |
| `login-page` | 1,184 |
| `qr-scanner-worker.min` | 10,381 |
| `select-field` | 38,990 (112,826 raw; loaded by admin/scan paths, not preloaded in `index.html`) |

### Request math

- Dashboard: 2 stats RPCs + 1 activity query = 3 requests per 5 s per visible tab.
- 6 hours = 21,600 s / 5 = 4,320 cycles.
- 3 tabs × 4,320 × 3 = **38,880 requests**.

### Not measured

- Lighthouse mobile/Slow 4G (no staging/live URL).
- `EXPLAIN (ANALYZE, BUFFERS)` (no staging DB).
- k6 load tests (no staging credentials/Turnstile test secret).
- Real-device LCP/INP, camera, low brightness, in-app browsers.
- Supabase CPU/memory/connection peaks.

## 5. Not verified

### Missing staging inputs

`STAGING_SUPABASE_URL` and `STAGING_ANON_KEY` were **not present** in the audit shell (checked by length only; no values printed). No production writes or load tests were run.

To complete the runtime checks, provide:

1. `STAGING_SUPABASE_URL` and `STAGING_ANON_KEY` exported in the audit shell.
2. A staging non-admin staff JWT and a deactivated-staff JWT.
3. Staging service-role access for the `activity_logs` append-only test.
4. Staging Edge Functions deployed (`register-guest`, `manage-staff`) with the Cloudflare **test** Turnstile secret; registration open on staging.
5. A staging URL for Lighthouse and k6; permission to insert 5,000 `ZZ Test` guests and clean them up.
6. Real-device access for the Appendix E checks.

### Checks marked CANNOT VERIFY

- SEC-10, SEC-11, SEC-12, SEC-13, SEC-17, SEC-21, SEC-50.
- DATA-01, DATA-03, DATA-04, DATA-05, DATA-10, DATA-11, DATA-12, DATA-20, DATA-21, DATA-22, DATA-30, DATA-31, DATA-32, DATA-34, DATA-35, DATA-40, DATA-41, DATA-51.
- PERF-03, PERF-10, PERF-20–24, PERF-30–32.
- UX-01–07, UX-12–14, UX-20–26.
- All OPS checks: `NOT RUN (Pass B)`.

### Manual checks for the owner (Appendix E)

Real phone camera scanning, printed QR poster, venue network, battery/power, full staff dry run, and client sign-off on team spellings/rules.

## 6. Recommended fix order

1. **F-10 / UX-10** — clear stale scanner results before every request; add a network-error test. This is the safest event-day fix.
2. **F-07 / DATA-33** — make winner recording atomic; add a uniqueness/serialization test on staging.
3. **Run SEC-10–13 on staging** — anon table/RPC denial, staff JWT restrictions, station lock, deactivated staff. Fix any mismatch before load testing.
4. **F-06 / DATA-06** — add request-id idempotency and a lost-response test.
5. **F-03 / SEC-20** — add the Edge Function body-size guard.
6. **F-05 / DATA-02** — require a letter in names in both Zod and SQL.
7. **F-08 / DATA-42** — exclude voided guests from the checked-in filter or relabel it.
8. **F-09 / DATA-50** — close audit gaps and await/check audit writes.
9. **F-11/F-12/F-13** — reduce guest JS/fonts/images and combine dashboard polling.
10. **F-01/F-02/F-04/F-14/F-15** — low-priority cleanup; F-02 needs a plan decision, not a blind code change.

## 7. Regression checklist

Re-run after fixes:

- `npm run build`
- `npx tsc --noEmit`
- `npm run lint` (expect 0 errors; track remaining warnings)
- `npm run build` then verify `dist/index.html` preload list and gzip size
- `npm audit --omit=dev`
- Anon table and RPC matrix against staging (Appendix B), including `teams`, `raffle_pool`, `guest_overview`
- Staff JWT matrix: own row only, no guests/token/backup_code, no admin RPCs
- Station mismatch + deactivated staff RPC rejection
- 20 same-name registrations and 100 distinct registrations on staging
- 10 parallel check-ins and 10 parallel claims on staging
- Concurrent `record_winner` calls with the same guest
- Lost-response/idempotency retry
- Scanner network failure after a prior success: no green card
- CSV formulas: `=1+1`, `-cmd`, `@SUM(A1)`, `+1`, tab, CR
- Guests filter: voided+checked-in guest under each status
- `EXPLAIN (ANALYZE, BUFFERS)` with 5,000 staging guests
- Lighthouse `/register` and `/g/:token` (three runs, median)
- Real-phone journeys in Appendix E
- `docs/EVENT_DAY.md` walk-through against the current UI

## Appendix A — Read-only verification queries to run in Supabase SQL Editor

Run these on production and staging. Do not assume results; paste the output back. The stored `STAGING_*` credentials are not needed for the SQL Editor, but the owner must run them.

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

## Appendix B — Staging-only actions, not run

No load test, 5,000-row insert, or concurrency script was run. The test guest generator and cleanup must be run only on staging, with `ZZ Test` names. Appendix D k6 scenarios and Appendix E real-device checks remain pending.

**Stop here.** No fixes were applied. Waiting for the owner to approve findings and provide the missing staging inputs / Appendix A results.

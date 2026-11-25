# KJBA Pass

High-performance, QR-based event registration, check-in, station claims, and raffle management platform. Built for the **Safelinx Christmas Party** by KJBA Production.

---

## Overview

KJBA Pass is an event operations system tailored for fast crowd throughput, fraud prevention, and live raffle draws without guest login friction.

- **Guests**: Open the registration link, enter their full name with Cloudflare Turnstile protection, and receive a permanent digital QR pass with a 6-character backup code.
- **Staff**: Station-locked mobile scanner supporting Entrance Check-in, Cocktail Booth, and Bundle of Joy stations with instant duplicate rejection and manual lookup fallback.
- **Administrators**: Real-time event turnout metrics, guest list management with CSV export (injection-safe), audit log tracking, staff access control, and raffle pool export.

---

## Tech Stack

- **Frontend**: React 19, TypeScript (strict mode), Vite
- **Styling & UI**: Tailwind CSS, shadcn/ui, Board UI tokens
- **Data & State**: TanStack Query, React Router, React Hook Form, Zod
- **Backend & Database**: Supabase (PostgreSQL, Row-Level Security, Edge Functions)
- **Security & Bot Protection**: Cloudflare Turnstile, server-side Edge Function verification
- **Hardware Integration**: `qr-scanner` (Worker-accelerated camera scanning), `qrcode.react`

---

## Architecture & Security Highlights

- **Zero Guest Credentials**: Guests access passes exclusively through cryptographically secure URL tokens and 6-character backup codes.
- **Strict Row-Level Security**: Anon role has no direct read/write access to core tables (`guests`, `staff`, `settings`, `claims`). Writes are strictly executed through validated database RPC functions.
- **Turnstile Verification via Edge Function**: Public registrations route through a Supabase Edge Function (`register-guest`) that validates Turnstile tokens server-side before persisting records.
- **Append-Only Audit Trail**: `activity_logs` is protected by database triggers that strictly reject updates and deletions.
- **Optimized Bundle Splitting**: Lazy-loaded staff, scanner, and admin bundles keep guest registration initial load under 150kB gzipped for rapid loading under congested cellular networks.

---

## Project Structure

```
kjba-pass/
├─ docs/
│  └─ EVENT_DAY.md          # Complete runbook for staff & admin on event day
├─ supabase/
│  ├─ sql/                  # Numbered idempotent database migrations (01-10, 99)
│  ├─ templates/            # Admin, staff, and load testing SQL templates
│  ├─ functions/            # Supabase Edge Functions (register-guest)
│  ├─ README.md             # Database apply guide
│  └─ APPLIED.md            # Applied migrations tracker
├─ src/
│  ├─ components/           # UI components, layout shells, status badges
│  ├─ features/
│  │  ├─ register/          # Guest registration form with Turnstile
│  │  ├─ pass/              # Guest digital QR pass & status view
│  │  ├─ scanner/           # Station-locked camera QR scanner & manual lookup
│  │  ├─ auth/              # Staff & admin authentication & route guards
│  │  └─ admin/             # Dashboard, guests, raffle, staff, logs, settings
│  ├─ lib/                  # Supabase client, CSV export, formatters, QR helpers
│  └─ routes.tsx            # Code-split application routes
└─ vercel.json              # Security headers (nosniff, DENY, camera permissions) & SPA rewrites
```

---

## Getting Started

### 1. Prerequisites

- Node.js 20+
- Supabase Project (PostgreSQL database + Auth + Edge Function)
- Cloudflare Turnstile Site Key & Secret Key

### 2. Environment Variables

Create `.env.local` based on `.env.example`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_TURNSTILE_SITE_KEY=your-turnstile-site-key
```

### 3. Installation & Local Development

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev
```

### 4. Production Build

```bash
# Type check and build bundle
npm run build

# Preview build locally
npm run preview
```

---

## Operations & Event Day

Refer to [docs/EVENT_DAY.md](docs/EVENT_DAY.md) for step-by-step procedures covering:
- Pre-event hardware, camera, and staff device preparation
- Entrance flow, help desk recovery, and station claims
- External spin-the-wheel raffle export and absent-winner voiding
- Post-event CSV backup and cutoff procedures

---

## License

Private and proprietary. Powered by KJBA Production for Safelinx Christmas Party 2026.

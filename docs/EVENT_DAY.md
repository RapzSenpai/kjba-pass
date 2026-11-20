# KJBA Pass — Event-Day Runbook

This runbook covers operational instructions for staff and administrators at the event (**Safelinks Christmas Party**, Dec 19, 2026, Toledo Megadome Sports Center, Timezone: `Asia/Manila`).

---

## 1. One Day Before

- [ ] **Verify Supabase Status**: Open the Supabase dashboard to verify the free-tier project is active and not paused.
- [ ] **Prepare Staff Phones**:
  - Open `/login` on each staff phone.
  - Sign in with station-specific credentials.
  - Verify the assigned station badge appears (`Check-in`, `Cocktail`, or `Bundle of Joy`).
  - Keep browser logged in and prevent screen timeout.
- [ ] **Test Cameras**:
  - Open `/scan` on each phone and allow camera permissions.
  - Test test-scans under ambient lighting.
  - Ensure all phones are 100% charged and spare power banks are packed.
- [ ] **Configure Event Settings**:
  - Open `/admin/settings` as admin.
  - Set `registration_open` and `checkin_open` windows.
  - Confirm event timezone displays `Asia/Manila`.
- [ ] **Signage & Materials**:
  - Print registration QR posters with:
    - Event name
    - "Scan to register"
    - "Take a screenshot of your pass"
    - "Must be present to win"
  - Place "Help Desk" signage at the entrance.

---

## 2. During the Event

### Entrance (Check-in)
- 2–3 staff phones stationed on **Check-in** (`/scan`).
- Direct guests to scan the printed poster QR to register if they haven't already.
- Scan guest's pass QR (or type 6-character backup code) on entry.
- Valid scan gives green confirmation and marks guest as checked in.
- Duplicate scan shows red "Already checked in" with timestamp.

### Help Desk
- 1 staff/admin phone on `/scan` using the **Find Guest** tab.
- If guest lost their QR or phone died:
  - Search guest by name (minimum 3 characters).
  - Confirm identity and manually check in or claim for them.
  - All manual actions are recorded in activity logs.

### Booths (Cocktail & Bundle of Joy)
- Stationed staff scan guest QR to claim.
- Reject guests with amber card if not checked in at entrance first.
- Exactly 1 claim per station per guest. Repeat scans show red "Already claimed".

### Admin & Raffle Draw
- Keep `/admin` dashboard open on laptop or tablet to monitor live turnout counts.
- Before each raffle spin:
  1. Open `/admin/raffle`.
  2. Click **Copy Eligible Names** (copies only checked-in, non-voided, non-winning guests).
  3. Paste names into external spin-the-wheel tool.
  4. Spin the wheel to determine the winner.
  5. Under "Record winner", enter guest name and prize won, then click **Record Winner**.
- **Absent Winner Handling**:
  - If winner is not present to claim within the announced time window:
  - Locate winner in the winners table and click **Void Winner**.
  - Choose reason "Absent" and do **NOT** return to pool ("Must be present to win" rule).
  - Re-copy fresh eligible pool and spin again.

---

## 3. After Check-in Cutoff

- When entrance closes:
  - Toggle off **Check-in Open** in `/admin/settings` (or rely on automated cutoff time).
  - Optionally click **Lock Raffle Pool** in `/admin/raffle` to freeze eligibility.

---

## 4. After the Event

- [ ] Export all guest records:
  - Go to `/admin/guests`.
  - Click **Export CSV** (includes check-in status, claim flags, and timestamps).
  - Store backup copy securely.
- [ ] Close event:
  - In `/admin/settings`, turn off **Registration Open** and **Check-in Open**.

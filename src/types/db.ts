// Hand-written types for Supabase RPC results, views, and tables read directly.
// Timestamps are ISO 8601 strings as returned by Supabase.

export type StaffRole = 'admin' | 'staff'
export type Station = 'entrance' | 'cocktail' | 'bundle'
export type ClaimStation = 'cocktail' | 'bundle'
export type ClaimMethod = 'scan' | 'code' | 'manual'
export type TeamSite = 'Toledo' | 'Talisay'

export type Team = {
  id: string
  name: string
  site: TeamSite
}

export type TeamStats = {
  id: string | null
  name: string
  site: TeamSite | 'Unassigned'
  registered: number
  eligible: number
  cocktail_claimed: number
  bundle_claimed: number
}

export type LogAction =
  | 'register'
  | 'check_in'
  | 'claim'
  | 'void_guest'
  | 'restore_guest'
  | 'undo_check_in'
  | 'undo_claim'
  | 'record_winner'
  | 'void_winner'
  | 'export_guests'
  | 'copy_raffle_names'
  | 'update_settings'
  | 'create_staff'
  | 'reset_staff_password'
  | 'set_staff_active'

export type ManageStaffAction = 'create' | 'reset_password' | 'set_active'

export type ManageStaffErrorCode =
  | 'email_exists'
  | 'invalid_input'
  | 'not_admin'
  | 'not_allowed'
  | 'not_found'
  | 'unauthenticated'
  | 'server_error'

export type ManageStaffRequest =
  | { action: 'create'; full_name: string; email: string; station: Station; password: string }
  | { action: 'reset_password'; user_id: string; password: string }
  | { action: 'set_active'; user_id: string; active: boolean }

export type ManageStaffResult =
  | { ok: true; user_id?: string }
  | { ok: false; code: ManageStaffErrorCode; message: string }

export type PublicSettings = {
  event_name: string
  event_date: string
  venue: string
  timezone: string
  notice_text: string
  registration_open: boolean
  registration_closes_at: string | null
}

export type RegisterRequest = {
  name: string
  team_id: string
  turnstileToken: string
  request_id: string
}

export type RegisterResult =
  | {
      ok: true
      name: string
      token: string
      backup_code: string
      team: string
      site: TeamSite
    }
  | {
      ok: false
      code:
        | 'registration_closed'
        | 'invalid_name'
        | 'name_exists'
        | 'invalid_team'
        | 'turnstile_failed'
      message: string
    }

export type GuestPass =
  | {
      ok: true
      name: string
      team: string | null
      site: TeamSite | null
      token: string
      backup_code: string
      checked_in: boolean
      voided: boolean
      cocktail_claimed: boolean
      bundle_claimed: boolean
    }
  | { ok: false; code: 'not_found' }

export type StationResult =
  | {
      ok: true
      code: 'checked_in' | 'claimed'
      message: string
      guest_name: string
      at: string
    }
  | {
      ok: false
      code:
        | 'not_found'
        | 'voided'
        | 'pool_locked'
        | 'checkin_closed'
        | 'already_checked_in'
        | 'already_claimed'
        | 'not_checked_in'
        | 'station_disabled'
      message: string
      guest_name?: string
      at?: string
    }

export type SearchGuest = {
  id: string
  name: string
  team: string | null
  site: TeamSite | null
  checked_in_at: string | null
  voided: boolean
  cocktail_claimed: boolean
  bundle_claimed: boolean
}

export type GuestOverviewRow = {
  id: string
  name: string
  team_id: string | null
  team: string | null
  site: TeamSite | null
  created_at: string
  checked_in_at: string | null
  checked_in_method: ClaimMethod | null
  voided: boolean
  void_reason: string | null
  cocktail_claimed: boolean
  bundle_claimed: boolean
}

export type RafflePoolEntry = {
  id: string
  name: string
}

export type WinnerRow = {
  id: string
  guest_id: string
  prize: string
  drawn_at: string
  drawn_by: string | null
  voided: boolean
  void_reason: string | null
  voided_at: string | null
  return_to_pool: boolean
}

export type WinnerWithGuest = WinnerRow & {
  guests: { name: string } | null
}

export type ActivityLogRow = {
  id: number
  created_at: string
  actor_id: string | null
  actor_name: string | null
  actor_role: string | null
  action: LogAction
  guest_id: string | null
  guest_name: string | null
  station: Station | null
  method: ClaimMethod | null
  result: string | null
  details: Record<string, unknown>
}

export type StaffRow = {
  user_id: string
  full_name: string
  role: StaffRole
  station: Station | null
  active: boolean
  created_at: string
  last_active_at: string | null
}

export type SettingsRow = {
  id: number
  event_name: string
  event_date: string
  venue: string
  timezone: string
  notice_text: string
  registration_open: boolean
  registration_closes_at: string | null
  checkin_open: boolean
  checkin_closes_at: string | null
  cocktail_enabled: boolean
  bundle_enabled: boolean
  raffle_locked: boolean
  updated_at: string
}

export type DashboardStats = {
  registered: number
  eligible: number
  not_checked_in: number
  voided: number
  cocktail_claimed: number
  bundle_claimed: number
  winners: number
}

export type AdminResult =
  | { ok: true; winner_id?: string }
  | { ok: false; code: string; message: string }

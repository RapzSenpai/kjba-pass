import type { ClaimMethod, LogAction, Station } from '@/types/db'

export const actionLabels = {
  register: 'Registered',
  check_in: 'Check-in',
  claim: 'Claim',
  void_guest: 'Voided guest',
  restore_guest: 'Restored guest',
  undo_check_in: 'Undid check-in',
  undo_claim: 'Undid claim',
  record_winner: 'Recorded winner',
  void_winner: 'Voided winner',
  export_guests: 'Exported guests',
  copy_raffle_names: 'Copied raffle names',
  update_settings: 'Updated settings',
  create_staff: 'Created staff',
  reset_staff_password: 'Reset staff password',
  set_staff_active: 'Set staff active',
} satisfies Record<LogAction, string>

export const stationLabels: Record<Station, string> = {
  entrance: 'Entrance',
  cocktail: 'Cocktail',
  bundle: 'Bundle of Joy',
}

export const methodLabels: Record<ClaimMethod, string> = {
  scan: 'Scan',
  code: 'Backup code',
  manual: 'Manual',
}

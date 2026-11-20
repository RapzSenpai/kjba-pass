// Typed wrapper for manage-staff Edge Function calls.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Station } from '@/types/db'

export type ManageStaffError = {
  ok: false
  code: string
  message: string
  field?: string
}

export type ManageStaffResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | ManageStaffError

async function call<T = Record<string, never>>(
  body: Record<string, unknown>,
): Promise<ManageStaffResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke<ManageStaffResult<T>>(
      'manage-staff',
      { body },
    )
    if (error) {
      if (error instanceof FunctionsHttpError) {
        try {
          const payload = (await (error.context as Response).json()) as ManageStaffError
          return payload
        } catch {
          // fall through
        }
      }
      return { ok: false, code: 'server_error', message: 'Network error. Try again.' }
    }
    return data ?? { ok: false, code: 'server_error', message: 'Empty response.' }
  } catch {
    return { ok: false, code: 'server_error', message: 'Network error. Try again.' }
  }
}

export function createStaff(params: {
  full_name: string
  email: string
  station: Station
  password: string
}): Promise<ManageStaffResult<{ user_id: string }>> {
  return call<{ user_id: string }>({ action: 'create', ...params })
}

export function resetStaffPassword(params: {
  user_id: string
  password: string
}): Promise<ManageStaffResult> {
  return call({ action: 'reset_password', ...params })
}

export function setStaffActive(params: {
  user_id: string
  active: boolean
}): Promise<ManageStaffResult> {
  return call({ action: 'set_active', ...params })
}

export function mapError(code: string | undefined): string {
  switch (code) {
    case 'email_exists':
      return 'That email already exists. If it was created earlier in Supabase and has no staff row, remove it there first.'
    case 'invalid_input':
      return 'Invalid input. Check the fields and try again.'
    case 'not_admin':
      return 'Admin access required.'
    case 'not_allowed':
      return 'This action is not allowed for this account.'
    case 'not_found':
      return 'Staff member not found.'
    default:
      return 'Something went wrong. Try again.'
  }
}

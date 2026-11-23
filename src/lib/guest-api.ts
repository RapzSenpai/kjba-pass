import { env } from './env'
import type { RegisterRequest, RegisterResult } from '@/types/db'

// Guest pages talk to Supabase over plain fetch so supabase-js stays out of their bundle.
const headers = {
  apikey: env.supabaseAnonKey,
  Authorization: `Bearer ${env.supabaseAnonKey}`,
  'Content-Type': 'application/json',
}

export async function guestRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${env.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  })

  if (!response.ok) throw new Error(`${fn} failed with ${response.status}`)
  return (await response.json()) as T
}

export async function registerGuest(body: RegisterRequest): Promise<RegisterResult | null> {
  const response = await fetch(`${env.supabaseUrl}/functions/v1/register-guest`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  try {
    return (await response.json()) as RegisterResult
  } catch {
    return null
  }
}

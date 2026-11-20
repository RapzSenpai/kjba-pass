import { createClient } from '@supabase/supabase-js'
import { env } from './env'

// Only the anon (publishable) key belongs in the frontend. The service role key never does.
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

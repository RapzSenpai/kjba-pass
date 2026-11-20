const REQUIRED = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_TURNSTILE_SITE_KEY',
] as const

function read(key: (typeof REQUIRED)[number]): string {
  const value = import.meta.env[key] as string | undefined
  if (!value) {
    throw new Error(`Missing ${key}. Copy .env.example to .env.local and fill it in.`)
  }
  return value
}

export const env = {
  supabaseUrl: read('VITE_SUPABASE_URL'),
  supabaseAnonKey: read('VITE_SUPABASE_ANON_KEY'),
  turnstileSiteKey: read('VITE_TURNSTILE_SITE_KEY'),
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Deployed by pasting this file into the Supabase dashboard Edge Functions editor.
// Keep JWT verification on. The service role key is provided by the platform.

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const MAX_BODY_BYTES = 4096

function allowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGIN') ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(origin ? corsHeaders(origin) : {}),
      'Content-Type': 'application/json',
    },
  })
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const origins = allowedOrigins()

  if (!origin || !origins.includes(origin)) {
    return json({ ok: false, code: 'forbidden', message: 'Origin not allowed.' }, 403, null)
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  if (req.method !== 'POST') {
    return json({ ok: false, code: 'method_not_allowed', message: 'POST only.' }, 405, origin)
  }

  let payload: { name?: unknown; team_id?: unknown; turnstileToken?: unknown }
  try {
    const raw = await req.text()
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return json({ ok: false, code: 'invalid_request', message: 'Request is too large.' }, 413, origin)
    }
    payload = JSON.parse(raw)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return json({ ok: false, code: 'invalid_request', message: 'Invalid request.' }, 400, origin)
    }
  } catch {
    return json({ ok: false, code: 'invalid_request', message: 'Invalid request.' }, 400, origin)
  }

  const name = payload.name
  const teamId = payload.team_id
  const turnstileToken = payload.turnstileToken
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  if (
    typeof name !== 'string' ||
    typeof teamId !== 'string' ||
    typeof turnstileToken !== 'string' ||
    name.length > 200 ||
    !uuidPattern.test(teamId) ||
    turnstileToken.length === 0
  ) {
    return json({ ok: false, code: 'invalid_request', message: 'Invalid request.' }, 400, origin)
  }

  const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!turnstileSecret || !supabaseUrl || !serviceRoleKey) {
    return json(
      { ok: false, code: 'server_error', message: 'Registration is unavailable.' },
      500,
      origin,
    )
  }

  const verifyForm = new URLSearchParams({
    secret: turnstileSecret,
    response: turnstileToken,
  })
  const remoteip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (remoteip) verifyForm.set('remoteip', remoteip)

  let verified = false
  try {
    const verifyResponse = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: verifyForm,
    })
    const verifyResult = (await verifyResponse.json()) as {
      success?: boolean
      'error-codes'?: string[]
    }
    verified = verifyResult.success === true
    if (!verified) {
      console.error('turnstile verify failed', verifyResponse.status, verifyResult['error-codes'] ?? [])
    }
  } catch {
    verified = false
    console.error('turnstile verify request failed')
  }

  if (!verified) {
    return json(
      { ok: false, code: 'turnstile_failed', message: 'Verification failed. Try again.' },
      400,
      origin,
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.rpc('register_guest_internal', {
    p_name: name,
    p_team_id: teamId,
  })

  if (error) {
    console.error('register-guest: rpc failed')
    return json(
      { ok: false, code: 'server_error', message: 'Registration failed. Try again.' },
      500,
      origin,
    )
  }

  const result = data as { ok?: boolean; code?: string; message?: string } | null
  const status = result?.ok
    ? 200
    : result?.code === 'name_exists'
      ? 409
      : result?.code === 'registration_closed'
        ? 403
        : 400

  return json(
    result ?? { ok: false, code: 'server_error', message: 'Registration failed. Try again.' },
    status,
    origin,
  )
})

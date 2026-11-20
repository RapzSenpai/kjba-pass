import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Deployed by pasting into Supabase dashboard > Edge Functions > manage-staff. Keep JWT on.
// No new secrets needed. ALLOWED_ORIGIN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are auto-provided.

const MAX_BODY_BYTES = 4096

function allowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGIN') ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
}

function isValidStation(s: unknown): s is 'entrance' | 'cocktail' | 'bundle' {
  return s === 'entrance' || s === 'cocktail' || s === 'bundle'
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

  // Reject oversized bodies
  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY_BYTES) {
    return json({ ok: false, code: 'invalid_input', message: 'Request too large.' }, 400, origin)
  }

  // Caller auth check
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ok: false, code: 'unauthenticated', message: 'Missing token.' }, 401, origin)
  }
  const jwt = authHeader.slice(7)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: authData, error: authError } = await adminClient.auth.getUser(jwt)
  if (authError || !authData.user) {
    return json({ ok: false, code: 'unauthenticated', message: 'Invalid token.' }, 401, origin)
  }
  const callerId = authData.user.id

  // Verify caller is an active admin
  const { data: callerStaff } = await adminClient
    .from('staff')
    .select('full_name, role, active')
    .eq('user_id', callerId)
    .single()

  if (!callerStaff || !callerStaff.active || callerStaff.role !== 'admin') {
    // Log rejected attempt
    await adminClient.from('activity_logs').insert({
      actor_id: callerId,
      actor_name: callerStaff?.full_name ?? null,
      actor_role: callerStaff?.role ?? null,
      action: 'manage_staff',
      station: null,
      method: 'manual',
      result: 'rejected',
      details: { reason: 'not_admin' },
    })
    return json({ ok: false, code: 'not_admin', message: 'Admin access required.' }, 403, origin)
  }

  const callerName = callerStaff.full_name

  // Parse body (already size-checked above)
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, code: 'invalid_input', message: 'Invalid JSON.' }, 400, origin)
  }

  const action = body.action

  // ─── ACTION: create ───────────────────────────────────────────────────────
  if (action === 'create') {
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const station = body.station
    const password = typeof body.password === 'string' ? body.password : ''

    if (fullName.length < 2 || fullName.length > 80) {
      return json(
        { ok: false, code: 'invalid_input', message: 'Full name must be 2–80 characters.', field: 'full_name' },
        400, origin,
      )
    }
    if (!isValidEmail(email)) {
      return json(
        { ok: false, code: 'invalid_input', message: 'Enter a valid email address.', field: 'email' },
        400, origin,
      )
    }
    if (!isValidStation(station)) {
      return json(
        { ok: false, code: 'invalid_input', message: 'Invalid station.', field: 'station' },
        400, origin,
      )
    }
    if (password.length < 10 || password.length > 72) {
      return json(
        { ok: false, code: 'invalid_input', message: 'Password must be 10–72 characters.', field: 'password' },
        400, origin,
      )
    }

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (createError) {
      const isExists = createError.message?.toLowerCase().includes('already')
        || createError.code === 'email_exists'
        || (createError as { status?: number }).status === 422
      if (isExists) {
        return json(
          {
            ok: false,
            code: 'email_exists',
            message: 'That email already exists. If it was created earlier in Supabase and has no staff row, remove it there first.',
          },
          409, origin,
        )
      }
      return json({ ok: false, code: 'server_error', message: 'Could not create account.' }, 500, origin)
    }

    const userId = newUser.user.id

    const { error: insertError } = await adminClient.from('staff').insert({
      user_id: userId,
      full_name: fullName,
      role: 'staff', // always staff, never from request
      station,
      active: true,
    })

    if (insertError) {
      // Clean up orphan Auth user
      await adminClient.auth.admin.deleteUser(userId)
      return json({ ok: false, code: 'server_error', message: 'Account created but could not save staff record. Auth user cleaned up.' }, 500, origin)
    }

    await adminClient.from('activity_logs').insert({
      actor_id: callerId,
      actor_name: callerName,
      actor_role: 'admin',
      action: 'create_staff',
      station,
      method: 'manual',
      result: 'success',
      details: { target_user_id: userId, target_name: fullName },
    })

    return json({ ok: true, user_id: userId }, 200, origin)
  }

  // ─── ACTION: reset_password ───────────────────────────────────────────────
  if (action === 'reset_password') {
    const targetId = typeof body.user_id === 'string' ? body.user_id.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!targetId) {
      return json({ ok: false, code: 'invalid_input', message: 'Missing user_id.', field: 'user_id' }, 400, origin)
    }
    if (password.length < 10 || password.length > 72) {
      return json(
        { ok: false, code: 'invalid_input', message: 'Password must be 10–72 characters.', field: 'password' },
        400, origin,
      )
    }

    const { data: target } = await adminClient
      .from('staff')
      .select('full_name, role, station')
      .eq('user_id', targetId)
      .single()

    if (!target) {
      return json({ ok: false, code: 'not_found', message: 'Staff member not found.' }, 404, origin)
    }
    if (target.role !== 'staff') {
      await adminClient.from('activity_logs').insert({
        actor_id: callerId, actor_name: callerName, actor_role: 'admin',
        action: 'reset_staff_password', station: target.station ?? null, method: 'manual',
        result: 'rejected', details: { target_user_id: targetId, target_name: target.full_name, reason: 'not_allowed' },
      })
      return json({ ok: false, code: 'not_allowed', message: 'Cannot reset admin passwords here.' }, 403, origin)
    }

    const { error: resetError } = await adminClient.auth.admin.updateUserById(targetId, { password })
    if (resetError) {
      return json({ ok: false, code: 'server_error', message: 'Could not reset password.' }, 500, origin)
    }

    await adminClient.from('activity_logs').insert({
      actor_id: callerId, actor_name: callerName, actor_role: 'admin',
      action: 'reset_staff_password', station: target.station ?? null, method: 'manual',
      result: 'success', details: { target_user_id: targetId, target_name: target.full_name },
    })

    return json({ ok: true }, 200, origin)
  }

  // ─── ACTION: set_active ───────────────────────────────────────────────────
  if (action === 'set_active') {
    const targetId = typeof body.user_id === 'string' ? body.user_id.trim() : ''
    const active = body.active

    if (!targetId) {
      return json({ ok: false, code: 'invalid_input', message: 'Missing user_id.', field: 'user_id' }, 400, origin)
    }
    if (typeof active !== 'boolean') {
      return json({ ok: false, code: 'invalid_input', message: 'active must be a boolean.', field: 'active' }, 400, origin)
    }

    const { data: target } = await adminClient
      .from('staff')
      .select('full_name, role, station')
      .eq('user_id', targetId)
      .single()

    if (!target) {
      return json({ ok: false, code: 'not_found', message: 'Staff member not found.' }, 404, origin)
    }
    if (target.role !== 'staff') {
      await adminClient.from('activity_logs').insert({
        actor_id: callerId, actor_name: callerName, actor_role: 'admin',
        action: 'set_staff_active', station: target.station ?? null, method: 'manual',
        result: 'rejected', details: { target_user_id: targetId, target_name: target.full_name, active, reason: 'not_allowed' },
      })
      return json({ ok: false, code: 'not_allowed', message: 'Cannot change admin active status here.' }, 403, origin)
    }

    // Update staff row first
    const { error: staffUpdateError } = await adminClient
      .from('staff')
      .update({ active })
      .eq('user_id', targetId)

    if (staffUpdateError) {
      return json({ ok: false, code: 'server_error', message: 'Could not update staff record.' }, 500, origin)
    }

    // Sync ban status in Auth
    const banDuration = active ? 'none' : '876000h'
    const { error: banError } = await adminClient.auth.admin.updateUserById(targetId, {
      ban_duration: banDuration,
    })

    if (banError) {
      // Revert staff.active on Auth failure
      await adminClient.from('staff').update({ active: !active }).eq('user_id', targetId)
      return json({ ok: false, code: 'server_error', message: 'Could not sync auth status. Changes reverted.' }, 500, origin)
    }

    await adminClient.from('activity_logs').insert({
      actor_id: callerId, actor_name: callerName, actor_role: 'admin',
      action: 'set_staff_active', station: target.station ?? null, method: 'manual',
      result: 'success', details: { target_user_id: targetId, target_name: target.full_name, active },
    })

    return json({ ok: true }, 200, origin)
  }

  return json({ ok: false, code: 'invalid_input', message: 'Unknown action.' }, 400, origin)
})

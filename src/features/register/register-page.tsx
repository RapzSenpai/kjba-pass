import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Turnstile } from '@marsidev/react-turnstile'
import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/common/checkbox'
import { SelectField } from '@/components/common/select-field'
import { usePublicSettings } from '@/hooks/usePublicSettings'
import { env } from '@/lib/env'
import { formatEventDate } from '@/lib/format'
import { guestRpc, registerGuest } from '@/lib/guest-api'
import type { RegisterRequest, RegisterResult, Team } from '@/types/db'

const TOKEN_KEY = 'kjba_pass_token'
const REQUEST_KEY = 'kjba_reg_request_id'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Enter your full name.')
    .max(80, 'Name is too long.')
    .regex(/^[A-Za-zÀ-ÖØ-öø-ÿ .'-]+$/, "Use letters, spaces, . - ' only.")
    .regex(/[A-Za-zÀ-ÖØ-öø-ÿ]/, 'Enter your full name.'),
  team_id: z
    .string()
    .min(1, 'Select your team.')
    .refine((value) => UUID_PATTERN.test(value), 'Select your team.'),
})

type FormValues = z.infer<typeof formSchema>

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function storeToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Storage can be blocked; the pass still works in this tab.
  }
}

// Reused across retries so a lost response returns the same pass instead of name_exists.
function readRequestId(): string {
  try {
    const stored = localStorage.getItem(REQUEST_KEY)
    if (stored && UUID_PATTERN.test(stored)) return stored
    const next = crypto.randomUUID()
    localStorage.setItem(REQUEST_KEY, next)
    return next
  } catch {
    return crypto.randomUUID()
  }
}

function clearRequestId() {
  try {
    localStorage.removeItem(REQUEST_KEY)
  } catch {
    // Storage can be blocked; the next attempt just gets a new id.
  }
}

function PageState({ title, onRetry }: { title: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center">
      <p className="text-base font-medium">{title}</p>
      {onRetry ? (
        <Button type="button" variant="outline" className="h-11 px-4 text-base" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}

export function RegisterPage() {
  const settings = usePublicSettings()
  const teams = useQuery({
    queryKey: ['teams'],
    queryFn: () => guestRpc<Team[]>('get_teams', {}),
    staleTime: 60 * 60 * 1000,
  })
  const navigate = useNavigate()
  const [storedToken] = useState(readStoredToken)
  const [requestId] = useState(readRequestId)
  const [accepted, setAccepted] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileKey, setTurnstileKey] = useState(0)
  const [turnstileError, setTurnstileError] = useState(false)
  const [turnstileErrorCode, setTurnstileErrorCode] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', team_id: '' },
  })

  const teamId = useWatch({ control, name: 'team_id' })
  const teamList = teams.data ?? []
  const selectedTeam = teamList.find((team) => team.id === teamId)
  const toledoTeams = teamList.filter((team) => team.site === 'Toledo')
  const talisayTeams = teamList.filter((team) => team.site === 'Talisay')
  const teamsUnavailable = teams.isError || (!teams.isPending && teamList.length === 0)

  function resetTurnstile() {
    setTurnstileToken(null)
    setTurnstileKey((key) => key + 1)
  }

  function showFailure(payload: RegisterResult | null) {
    if (payload && !payload.ok) {
      if (payload.code === 'invalid_team') {
        setError('team_id', { message: payload.message })
        return
      }
      setFormError(payload.message)
      return
    }
    setFormError('Something went wrong. Please try again.')
  }

  async function onSubmit(values: FormValues) {
    if (!accepted || !turnstileToken) return

    const team = teamList.find((item) => item.id === values.team_id)
    if (!team) {
      setError('team_id', { message: 'Select your team.' })
      return
    }

    setFormError(null)

    const body: RegisterRequest = {
      name: values.name,
      team_id: team.id,
      turnstileToken,
      request_id: requestId,
    }

    let data: RegisterResult | null
    try {
      data = await registerGuest(body)
    } catch {
      data = null
    }

    if (!data) {
      showFailure(null)
      resetTurnstile()
      return
    }

    if (!data.ok) {
      showFailure(data)
      resetTurnstile()
      return
    }

    storeToken(data.token)
    clearRequestId()
    navigate(`/g/${data.token}`)
  }

  if (settings.isPending) {
    return <PageState title="Loading…" />
  }

  if (settings.isError) {
    return <PageState title="Could not load the event." onRetry={() => void settings.refetch()} />
  }

  const event = settings.data

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{event.event_name}</h1>
        <p className="text-sm text-muted-foreground">
          {formatEventDate(event.event_date)} · {event.venue}
        </p>
      </header>

      {storedToken ? (
        <Link
          to={`/g/${storedToken}`}
          className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm"
        >
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">You already registered on this device.</span>
            <span className="text-muted-foreground">View my pass</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      ) : null}

      {!event.registration_open ? (
        <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Registration is closed</h2>
          <p className="text-sm text-muted-foreground">
            Registration is not open right now. Please see the help desk.
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Get your pass</h2>
            <p className="text-sm text-muted-foreground">Enter your full name. Duplicate names are not allowed.</p>
          </div>

          {teamsUnavailable ? (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-muted p-3">
              <p className="text-sm font-medium">Could not load teams.</p>
              <Button
                type="button"
                variant="outline"
                className="h-11 px-4 text-base"
                onClick={() => void teams.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : null}

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Full name
              <input
                {...register('name')}
                autoComplete="name"
                enterKeyHint="done"
                className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name ? (
                <span className="text-sm font-normal text-destructive">{errors.name.message}</span>
              ) : null}
            </label>

            <div className="flex flex-col gap-1.5">
              <SelectField
                id="register-team"
                label="Team"
                value={teamId || null}
                onValueChange={(next) => setValue('team_id', next, { shouldValidate: true })}
                placeholder="Select your team"
                error={errors.team_id?.message}
                disabled={teams.isPending || teamsUnavailable}
                groups={[
                  {
                    label: 'Toledo Team',
                    options: toledoTeams.map((team) => ({ value: team.id, label: team.name })),
                  },
                  {
                    label: 'Talisay Team',
                    options: talisayTeams.map((team) => ({ value: team.id, label: team.name })),
                  },
                ]}
              />
              {teams.isPending ? (
                <span className="text-sm text-muted-foreground">Loading teams…</span>
              ) : null}
            </div>

            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Site
              <input
                value={selectedTeam?.site ?? 'Auto-filled from team'}
                readOnly
                disabled
                aria-readonly="true"
                className="h-11 rounded-lg border border-input bg-muted px-3 text-base font-normal text-muted-foreground outline-none"
              />
            </label>

            <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
              <Checkbox
                checked={accepted}
                onCheckedChange={setAccepted}
                className="mt-0.5 size-5"
              />
              <span>I understand I must be present to win raffle prizes.</span>
            </label>

            <Turnstile
              key={turnstileKey}
              siteKey={env.turnstileSiteKey}
              options={{ theme: 'light', size: 'flexible' }}
              onSuccess={(token) => {
                setTurnstileToken(token)
                setTurnstileError(false)
                setTurnstileErrorCode(null)
              }}
              onExpire={() => setTurnstileToken(null)}
              onError={(code) => {
                setTurnstileToken(null)
                setTurnstileError(true)
                setTurnstileErrorCode(code)
              }}
            />

            {turnstileError ? (
              <p className="text-sm text-destructive">
                Verification could not load. Check your connection and try again.
                {import.meta.env.DEV && turnstileErrorCode ? ` (Turnstile: ${turnstileErrorCode})` : null}
              </p>
            ) : null}

            {formError ? (
              <p role="alert" className="rounded-lg bg-[var(--stop-soft)] px-3 py-2 text-sm text-[var(--stop-text)]">
                {formError}
              </p>
            ) : null}

            <Button
              type="submit"
              className="h-11 w-full text-base"
              disabled={
                !accepted || !turnstileToken || isSubmitting || !teamId || teamsUnavailable
              }
            >
              {isSubmitting ? 'Getting your pass…' : 'Get my pass'}
            </Button>
          </form>
        </section>
      )}
    </div>
  )
}

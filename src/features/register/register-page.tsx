import { useState } from 'react'
import { Turnstile } from '@marsidev/react-turnstile'
import { zodResolver } from '@hookform/resolvers/zod'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { usePublicSettings } from '@/hooks/usePublicSettings'
import { env } from '@/lib/env'
import { formatEventDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { RegisterResult } from '@/types/db'

const TOKEN_KEY = 'kjba_pass_token'

const nameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Enter your full name.')
    .max(80, 'Name is too long.')
    .regex(/^[A-Za-zÀ-ÖØ-öø-ÿ .'-]+$/, "Use letters, spaces, . - ' only."),
})

type NameValues = z.infer<typeof nameSchema>

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

async function readInvokeError(error: unknown): Promise<RegisterResult | null> {
  if (!(error instanceof FunctionsHttpError)) return null
  try {
    return (await (error.context as Response).json()) as RegisterResult
  } catch {
    return null
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
  const navigate = useNavigate()
  const [storedToken] = useState(readStoredToken)
  const [accepted, setAccepted] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileKey, setTurnstileKey] = useState(0)
  const [turnstileError, setTurnstileError] = useState(false)
  const [turnstileErrorCode, setTurnstileErrorCode] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NameValues>({ resolver: zodResolver(nameSchema) })

  function resetTurnstile() {
    setTurnstileToken(null)
    setTurnstileKey((key) => key + 1)
  }

  async function onSubmit(values: NameValues) {
    if (!accepted || !turnstileToken) return

    setFormError(null)

    const { data, error } = await supabase.functions.invoke<RegisterResult>('register-guest', {
      body: { name: values.name, turnstileToken },
    })

    if (error) {
      const payload = await readInvokeError(error)
      setFormError(
        payload && !payload.ok ? payload.message : 'Something went wrong. Please try again.',
      )
      resetTurnstile()
      return
    }

    if (!data) {
      setFormError('Something went wrong. Please try again.')
      resetTurnstile()
      return
    }

    if (!data.ok) {
      setFormError(data.message)
      resetTurnstile()
      return
    }

    storeToken(data.token)
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
          className="flex min-h-11 flex-col justify-center rounded-lg border border-border bg-muted px-3 py-2 text-sm"
        >
          <span className="font-medium">You already registered on this device.</span>
          <span className="text-muted-foreground">View my pass →</span>
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

            <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
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
              disabled={!accepted || !turnstileToken || isSubmitting}
            >
              {isSubmitting ? 'Getting your pass…' : 'Get my pass'}
            </Button>
          </form>
        </section>
      )}
    </div>
  )
}

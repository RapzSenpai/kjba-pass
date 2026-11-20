import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Logo } from '@/components/common/logo'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import type { StaffRole } from '@/types/db'

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email.').email('Enter a valid email.'),
  password: z.string().min(1, 'Enter your password.'),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const notice = (location.state as { message?: string } | null)?.message
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(values: LoginValues) {
    setFormError(null)

    const { data, error } = await supabase.auth.signInWithPassword(values)
    if (error || !data.user) {
      setFormError('Email or password is incorrect.')
      return
    }

    const { data: staffRow, error: staffError } = await supabase
      .from('staff')
      .select('role, active')
      .eq('user_id', data.user.id)
      .maybeSingle()

    const staff = staffRow as { role: StaffRole; active: boolean } | null

    if (staffError || !staff || !staff.active) {
      await supabase.auth.signOut()
      setFormError('Account not active.')
      return
    }

    navigate(staff.role === 'admin' ? '/admin' : '/scan', { replace: true })
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-8">
      <section className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
        <Logo />
        <h1 className="mt-6 text-2xl font-semibold">Staff login</h1>
        <p className="mt-1 text-sm text-muted-foreground">Use the account given by the organizer.</p>

        {notice ? (
          <p role="status" className="mt-4 rounded-lg bg-[var(--action-soft)] px-3 py-2 text-sm text-[var(--action-text)]">
            {notice}
          </p>
        ) : null}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Email
            <input
              {...register('email')}
              type="email"
              autoComplete="email"
              inputMode="email"
              className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email ? <span className="text-sm font-normal text-destructive">{errors.email.message}</span> : null}
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Password
            <input
              {...register('password')}
              type="password"
              autoComplete="current-password"
              className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-invalid={Boolean(errors.password)}
            />
            {errors.password ? (
              <span className="text-sm font-normal text-destructive">{errors.password.message}</span>
            ) : null}
          </label>

          {formError ? (
            <p role="alert" className="rounded-lg bg-[var(--stop-soft)] px-3 py-2 text-sm text-[var(--stop-text)]">
              {formError}
            </p>
          ) : null}

          <Button type="submit" className="h-11 w-full text-base" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </section>
    </main>
  )
}

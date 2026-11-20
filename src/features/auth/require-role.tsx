import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useSession } from '@/hooks/useSession'
import { useStaffProfile } from '@/hooks/useStaffProfile'
import { supabase } from '@/lib/supabase'
import type { StaffRole } from '@/types/db'

function ScreenState({
  title,
  detail,
  onRetry,
}: {
  title: string
  detail?: string
  onRetry?: () => void
}) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {detail ? <p className="max-w-sm text-sm text-muted-foreground">{detail}</p> : null}
      {onRetry ? (
        <Button type="button" variant="outline" className="h-11 px-4 text-base" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </main>
  )
}

function InactiveAccount() {
  const [done, setDone] = useState(false)

  useEffect(() => {
    let active = true
    supabase.auth.signOut().finally(() => {
      if (active) setDone(true)
    })
    return () => {
      active = false
    }
  }, [])

  if (!done) return <ScreenState title="Signing out…" />
  return <Navigate to="/login" replace state={{ message: 'Account not active.' }} />
}

export function RequireRole({ allowed }: { allowed: StaffRole[] }) {
  const { session, loading } = useSession()
  const profileQuery = useStaffProfile(session?.user.id)

  if (loading) return <ScreenState title="Loading…" />
  if (!session) return <Navigate to="/login" replace />
  if (profileQuery.isPending) return <ScreenState title="Loading…" />

  if (profileQuery.isError) {
    return (
      <ScreenState
        title="Could not load your account."
        detail="Check your connection and try again."
        onRetry={() => void profileQuery.refetch()}
      />
    )
  }

  const profile = profileQuery.data
  if (!profile || !profile.active) return <InactiveAccount />

  if (!allowed.includes(profile.role)) {
    return <Navigate to={profile.role === 'admin' ? '/admin' : '/scan'} replace />
  }

  return <Outlet />
}

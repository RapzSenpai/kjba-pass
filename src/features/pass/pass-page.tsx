import { CheckCircle2, Circle, RefreshCw } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { usePublicSettings } from '@/hooks/usePublicSettings'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { GuestPass } from '@/types/db'

function StatusRow({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {done ? (
        <CheckCircle2 className="size-5 shrink-0 text-[var(--success)]" aria-hidden />
      ) : (
        <Circle className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <span className="flex-1 text-sm font-medium">{label}</span>
      <span className={cn('text-sm', done ? 'text-[var(--success-text)]' : 'text-muted-foreground')}>
        {done ? 'Yes' : 'Not yet'}
      </span>
    </li>
  )
}

function PassCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  )
}

export function PassPage() {
  const { token } = useParams<{ token: string }>()
  const settings = usePublicSettings()

  const passQuery = useQuery({
    queryKey: ['pass', token],
    enabled: Boolean(token),
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<GuestPass> => {
      const { data, error } = await supabase.rpc('get_pass', { p_token: token ?? '' })
      if (error) throw error
      return data as GuestPass
    },
  })

  const refreshButton = (
    <Button
      type="button"
      variant="outline"
      className="h-11 w-full text-base"
      onClick={() => void passQuery.refetch()}
      disabled={passQuery.isFetching}
    >
      <RefreshCw className={cn('size-4', passQuery.isFetching && 'animate-spin')} aria-hidden />
      {passQuery.isFetching ? 'Refreshing…' : 'Refresh status'}
    </Button>
  )

  if (passQuery.isPending) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Loading your pass…
      </div>
    )
  }

  if (passQuery.isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-base font-medium">Could not load your pass.</p>
        <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
        {refreshButton}
      </div>
    )
  }

  const pass = passQuery.data

  if (!pass.ok) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 text-center">
        <h1 className="text-xl font-semibold">Pass not found</h1>
        <p className="text-sm text-muted-foreground">Go to the help desk.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm text-muted-foreground">Guest pass</p>
        <h1 className="text-3xl font-semibold break-words">{pass.name}</h1>
        {pass.team ? (
          <p className="text-sm text-muted-foreground">
            {pass.team} · {pass.site}
          </p>
        ) : null}
      </header>

      {pass.voided ? (
        <p
          role="alert"
          className="rounded-xl bg-[var(--stop-soft)] px-4 py-3 text-center text-base font-medium text-[var(--stop-text)]"
        >
          This pass is voided. Go to the help desk.
        </p>
      ) : (
        <>
          <div className="flex justify-center">
            <div className="rounded-xl border border-border bg-white p-3">
              <QRCodeSVG
                value={pass.token}
                size={280}
                level="M"
                marginSize={4}
                bgColor="#FFFFFF"
                fgColor="#000000"
                title="Guest QR pass"
                className="h-auto w-full max-w-[280px]"
              />
            </div>
          </div>

          <div className="text-center">
            <p className="text-sm text-muted-foreground">Backup code</p>
            <p className="font-mono text-3xl font-bold tracking-widest select-all">{pass.backup_code}</p>
          </div>

          {!pass.checked_in ? (
            <p className="rounded-xl bg-[var(--action-soft)] px-4 py-3 text-sm text-[var(--action-text)]">
              Show this QR at the entrance to qualify for the raffle and booths.
            </p>
          ) : null}

          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            <StatusRow done={pass.checked_in} label="Checked in" />
            <StatusRow done={pass.cocktail_claimed} label="Cocktail" />
            <StatusRow done={pass.bundle_claimed} label="Bundle of Joy" />
          </ul>

          <PassCard title="Keep this pass">
            <p className="text-sm text-muted-foreground">
              Take a screenshot of this page. Lost it? Go to the help desk.
            </p>
          </PassCard>

          {settings.data?.notice_text ? (
            <PassCard title="Reminder">
              <p className="text-sm text-muted-foreground">{settings.data.notice_text}</p>
            </PassCard>
          ) : null}

          <p className="text-center text-xs text-muted-foreground">
            Raise your screen brightness when showing this code.
          </p>
        </>
      )}

      {refreshButton}
    </div>
  )
}

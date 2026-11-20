import { useQuery } from '@tanstack/react-query'
import { formatDateTime } from '@/lib/format'
import { actionLabels } from '@/lib/labels'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/common/status-badge'
import type { ActivityLogRow, DashboardStats } from '@/types/db'

type RecentActivity = Pick<
  ActivityLogRow,
  'id' | 'created_at' | 'actor_name' | 'action' | 'guest_name' | 'result'
>

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-3xl font-semibold tabular-nums">{value}</span>
    </div>
  )
}

function SmallCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-card p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </div>
  )
}

function resultTone(result: string | null) {
  if (result === 'success') return 'success'
  if (result === 'already') return 'action'
  return 'stop'
}

export function DashboardPage() {
  const stats = useQuery({
    queryKey: ['dashboard_stats'],
    queryFn: async (): Promise<DashboardStats> => {
      const { data, error } = await supabase.rpc('dashboard_stats')
      if (error) throw error
      return data as DashboardStats
    },
    refetchInterval: 5000,
  })

  const recent = useQuery({
    queryKey: ['recent_activity'],
    queryFn: async (): Promise<RecentActivity[]> => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('id, created_at, actor_name, action, guest_name, result')
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error
      return (data ?? []) as RecentActivity[]
    },
    refetchInterval: 5000,
  })

  if (stats.isPending) {
    return <p className="text-sm text-muted-foreground">Loading dashboard…</p>
  }

  if (!stats.data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">Could not load the dashboard.</p>
        <Button type="button" variant="outline" className="h-11 px-4 text-base" onClick={() => void stats.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  const s = stats.data

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <span className="text-xs text-muted-foreground">Updates every 5s</span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Registered" value={s.registered} />
        <StatCard label="Eligible (present)" value={s.eligible} />
        <StatCard label="Cocktail claimed" value={s.cocktail_claimed} />
        <StatCard label="Bundle claimed" value={s.bundle_claimed} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <SmallCard label="Not checked in" value={s.not_checked_in} />
        <SmallCard label="Voided" value={s.voided} />
        <SmallCard label="Winners" value={s.winners} />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Recent activity</h2>

        {recent.isError && !recent.data ? (
          <p className="text-sm text-muted-foreground">Could not load recent activity.</p>
        ) : recent.isPending ? (
          <p className="text-sm text-muted-foreground">Loading activity…</p>
        ) : recent.data && recent.data.length > 0 ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {recent.data.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {actionLabels[row.action]}
                    {row.guest_name ? ` · ${row.guest_name}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.actor_name ?? 'Guest'} · {formatDateTime(row.created_at)}
                  </p>
                </div>
                <StatusBadge tone={resultTone(row.result)}>{row.result ?? '—'}</StatusBadge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        )}
      </div>
    </section>
  )
}

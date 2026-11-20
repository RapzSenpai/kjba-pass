import { useQuery } from '@tanstack/react-query'
import {
  Ban,
  ChevronDown,
  Gift,
  Martini,
  Trophy,
  UserCheck,
  UserX,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatDateTime } from '@/lib/format'
import { actionLabels } from '@/lib/labels'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/common/status-badge'
import type { ActivityLogRow, DashboardStats } from '@/types/db'

type RecentActivity = Pick<
  ActivityLogRow,
  'id' | 'created_at' | 'actor_name' | 'action' | 'guest_name' | 'result'
>

function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.max(max, 1)}
      aria-valuenow={value}
      className="h-1.5 overflow-hidden rounded-full bg-muted"
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  caption,
  progress,
}: {
  icon: LucideIcon
  label: string
  value: number
  caption: string
  progress?: { value: number; max: number }
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-3xl font-semibold tabular-nums">{value}</span>
      </div>
      <div className="mt-auto flex flex-col gap-1.5">
        {progress ? <ProgressBar value={progress.value} max={progress.max} label={label} /> : null}
        <span className="text-xs text-muted-foreground">{caption}</span>
      </div>
    </div>
  )
}

const smallCardTones = {
  action: 'bg-[var(--action-soft)] text-[var(--action-text)]',
  stop: 'bg-[var(--stop-soft)] text-[var(--stop-text)]',
  neutral: 'bg-muted text-muted-foreground',
} as const

function SmallCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon
  label: string
  value: number
  tone: keyof typeof smallCardTones
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          smallCardTones[tone],
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-xs text-muted-foreground">{label}</span>
        <span className="text-xl font-semibold tabular-nums">{value}</span>
      </div>
    </div>
  )
}

type ActivityGroup =
  | { kind: 'guest'; key: string; guest: string; rows: RecentActivity[]; latest: string }
  | { kind: 'single'; key: string; row: RecentActivity; latest: string }

function groupActivity(rows: RecentActivity[]): ActivityGroup[] {
  const groups = new Map<string, ActivityGroup>()

  for (const row of rows) {
    const key = row.guest_name ? `guest:${row.guest_name}` : `row:${row.id}`
    const existing = groups.get(key)

    if (existing?.kind === 'guest') {
      existing.rows.push(row)
      if (row.created_at > existing.latest) existing.latest = row.created_at
    } else if (!existing) {
      groups.set(
        key,
        row.guest_name
          ? { kind: 'guest', key, guest: row.guest_name, rows: [row], latest: row.created_at }
          : { kind: 'single', key, row, latest: row.created_at },
      )
    }
  }

  return [...groups.values()]
    .map((group) =>
      group.kind === 'guest'
        ? { ...group, rows: [...group.rows].sort((a, b) => a.created_at.localeCompare(b.created_at)) }
        : group,
    )
    .sort((a, b) => b.latest.localeCompare(a.latest))
    .slice(0, 6)
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
        .limit(30)

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
  const activity = recent.data ? groupActivity(recent.data) : []

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="size-2 rounded-full bg-[var(--success)] motion-safe:animate-pulse"
            aria-hidden
          />
          Live · updates every 5s
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Registered"
          value={s.registered}
          caption={`${s.not_checked_in} not checked in`}
        />
        <StatCard
          icon={UserCheck}
          label="Eligible (present)"
          value={s.eligible}
          caption={`${s.eligible} of ${s.registered} registered`}
          progress={{ value: s.eligible, max: s.registered }}
        />
        <StatCard
          icon={Martini}
          label="Cocktail claimed"
          value={s.cocktail_claimed}
          caption={`${s.cocktail_claimed} of ${s.eligible} eligible`}
          progress={{ value: s.cocktail_claimed, max: s.eligible }}
        />
        <StatCard
          icon={Gift}
          label="Bundle claimed"
          value={s.bundle_claimed}
          caption={`${s.bundle_claimed} of ${s.eligible} eligible`}
          progress={{ value: s.bundle_claimed, max: s.eligible }}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SmallCard icon={UserX} label="Not checked in" value={s.not_checked_in} tone="action" />
        <SmallCard icon={Ban} label="Voided" value={s.voided} tone="stop" />
        <SmallCard icon={Trophy} label="Winners" value={s.winners} tone="neutral" />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Recent activity</h2>
          <Link
            to="/admin/logs"
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            View all activity
          </Link>
        </div>

        {recent.isError && !recent.data ? (
          <p className="text-sm text-muted-foreground">Could not load recent activity.</p>
        ) : recent.isPending ? (
          <p className="text-sm text-muted-foreground">Loading activity…</p>
        ) : activity.length > 0 ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {activity.map((group) =>
              group.kind === 'guest' ? (
                <li key={group.key}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 outline-none hover:bg-muted/40 focus-visible:bg-muted/40 [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{group.guest}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {group.rows.map((row) => actionLabels[row.action]).join(' · ')} ·{' '}
                          {formatDateTime(group.latest)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge tone="neutral">
                          {group.rows.length} {group.rows.length === 1 ? 'event' : 'events'}
                        </StatusBadge>
                        <ChevronDown
                          className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                          aria-hidden
                        />
                      </div>
                    </summary>
                    <ul className="flex flex-col gap-2 border-t border-border bg-muted/30 px-4 py-3">
                      {group.rows.map((row) => (
                        <li key={row.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm">{actionLabels[row.action]}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.actor_name ?? 'Guest'} · {formatDateTime(row.created_at)}
                            </p>
                          </div>
                          <StatusBadge tone={resultTone(row.result)}>
                            {row.result ?? '—'}
                          </StatusBadge>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ) : (
                <li
                  key={group.key}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {actionLabels[group.row.action]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {group.row.actor_name ?? 'Guest'} · {formatDateTime(group.row.created_at)}
                    </p>
                  </div>
                  <StatusBadge tone={resultTone(group.row.result)}>
                    {group.row.result ?? '—'}
                  </StatusBadge>
                </li>
              ),
            )}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        )}
      </div>
    </section>
  )
}

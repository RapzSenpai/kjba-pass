import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Ban,
  ChevronDown,
  ChevronRight,
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
import type { ActivityLogRow, DashboardStats, TeamSite, TeamStats } from '@/types/db'

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
  className,
}: {
  icon: LucideIcon
  label: string
  value: number
  caption: string
  progress?: { value: number; max: number }
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-3 p-4 sm:p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <div>
        <span className="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">{value}</span>
      </div>
      <div className="mt-auto flex flex-col gap-1.5 pt-1">
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

function SummaryStat({
  icon: Icon,
  label,
  value,
  caption,
  tone,
}: {
  icon: LucideIcon
  label: string
  value: number
  caption: string
  tone: keyof typeof smallCardTones
}) {
  return (
    <div className="flex items-center gap-3 p-3 sm:p-4">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          smallCardTones[tone],
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-xl font-semibold tabular-nums sm:text-2xl">{value}</span>
          <span className="text-xs text-muted-foreground">{caption}</span>
        </span>
      </div>
    </div>
  )
}

function TeamStatRow({ team }: { team: TeamStats }) {
  return (
    <Link
      to={team.id ? `/admin/guests?team=${team.id}` : '/admin/guests?team=none'}
      className="group flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="line-clamp-2 min-w-0 text-sm" title={team.name}>
        {team.name}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-sm tabular-nums">
        <span className="font-semibold">{team.eligible}</span>
        <span className="text-muted-foreground">/ {team.registered}</span>
        <ChevronRight
          className="size-3.5 text-muted-foreground opacity-40 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100"
          aria-hidden
        />
      </span>
    </Link>
  )
}

function SiteSection({
  site,
  rows,
  className,
}: {
  site: TeamSite | 'Unassigned'
  rows: TeamStats[]
  className?: string
}) {
  const [showEmpty, setShowEmpty] = useState(false)
  const present = rows.reduce((sum, row) => sum + row.eligible, 0)
  const registered = rows.reduce((sum, row) => sum + row.registered, 0)
  const emptyCount = rows.filter((row) => row.registered === 0).length
  const visibleRows = showEmpty ? rows : rows.filter((row) => row.registered > 0)
  const href = site === 'Unassigned' ? '/admin/guests?team=none' : `/admin/guests?site=${site}`

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-2">
        <Link
          to={href}
          className="text-base font-semibold underline-offset-4 hover:underline"
        >
          {site}
        </Link>
        <span className="text-xs text-muted-foreground">
          {present} present · {registered} registered
        </span>
      </div>

      {visibleRows.length > 0 ? (
        <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2 xl:grid-cols-3">
          {visibleRows.map((team) => (
            <TeamStatRow key={team.id ?? team.name} team={team} />
          ))}
        </div>
      ) : null}

      {emptyCount > 0 ? (
        <button
          type="button"
          aria-expanded={showEmpty}
          onClick={() => setShowEmpty((current) => !current)}
          className="flex min-h-11 w-full flex-wrap items-center gap-2 rounded-md px-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>
            {emptyCount} {emptyCount === 1 ? 'team has' : 'teams have'} no registrations yet.
          </span>
          <span className="font-medium underline underline-offset-4">
            {showEmpty ? 'Hide' : 'Show all'}
          </span>
        </button>
      ) : null}
    </div>
  )
}

type DashboardData = {
  stats: DashboardStats
  teams: TeamStats[]
  recent: RecentActivity[]
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
  const snapshot = useQuery({
    queryKey: ['dashboard_snapshot'],
    queryFn: async (): Promise<DashboardData> => {
      const { data, error } = await supabase.rpc('dashboard_snapshot')
      if (error) throw error
      return data as DashboardData
    },
    refetchInterval: () => (document.visibilityState === 'visible' ? 5000 : false),
  })

  if (snapshot.isPending) {
    return <p className="text-sm text-muted-foreground">Loading dashboard…</p>
  }

  if (!snapshot.data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">Could not load the dashboard.</p>
        <Button type="button" variant="outline" className="h-11 px-4 text-base" onClick={() => void snapshot.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  const s = snapshot.data.stats
  const teamRows = snapshot.data.teams
  const unassigned = teamRows.find((team) => team.site === 'Unassigned')
  const activity = snapshot.data.recent.length > 0 ? groupActivity(snapshot.data.recent) : []
  const turnoutRate = s.registered > 0 ? Math.round((s.eligible / s.registered) * 100) : 0

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

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid auto-rows-fr grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Users}
            label="Registered"
            value={s.registered}
            caption={`${s.eligible} checked in (${turnoutRate}%) · ${s.not_checked_in} pending`}
            progress={{ value: s.eligible, max: s.registered }}
          />
          <StatCard
            icon={UserCheck}
            label="Eligible (present)"
            value={s.eligible}
            caption={`${s.eligible} of ${s.registered} registered`}
            progress={{ value: s.eligible, max: s.registered }}
            className="border-l border-border"
          />
          <StatCard
            icon={Martini}
            label="Cocktail claimed"
            value={s.cocktail_claimed}
            caption={`${s.cocktail_claimed} of ${s.eligible} eligible`}
            progress={{ value: s.cocktail_claimed, max: s.eligible }}
            className="border-t border-border lg:border-t-0 lg:border-l"
          />
          <StatCard
            icon={Gift}
            label="Bundle claimed"
            value={s.bundle_claimed}
            caption={`${s.bundle_claimed} of ${s.eligible} eligible`}
            progress={{ value: s.bundle_claimed, max: s.eligible }}
            className="border-t border-l border-border lg:border-t-0"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <SummaryStat
            icon={UserX}
            label="Not checked in"
            value={s.not_checked_in}
            caption={`of ${s.registered} registered`}
            tone="action"
          />
          <SummaryStat
            icon={Ban}
            label="Voided"
            value={s.voided}
            caption={`of ${s.registered} registered`}
            tone="stop"
          />
          <SummaryStat
            icon={Trophy}
            label="Winners"
            value={s.winners}
            caption="drawn so far"
            tone="neutral"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">By team</h2>
          {teamRows.length > 0 ? (
            <span className="text-xs text-muted-foreground">Present / Registered</span>
          ) : null}
        </div>
        {teamRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No teams yet.</p>
        ) : (
          <div className="flex flex-col">
            <SiteSection
              site="Toledo"
              rows={teamRows.filter((team) => team.site === 'Toledo')}
            />
            <SiteSection
              site="Talisay"
              className="mt-4 border-t border-border pt-4"
              rows={teamRows.filter((team) => team.site === 'Talisay')}
            />
            {unassigned ? (
              <SiteSection
                site="Unassigned"
                className="mt-4 border-t border-border pt-4"
                rows={[unassigned]}
              />
            ) : null}
          </div>
        )}
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

        {activity.length > 0 ? (
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

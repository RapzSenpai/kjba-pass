import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Download, MoreHorizontal } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { SelectField } from '@/components/common/select-field'
import { StatusBadge, type StatusTone } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { downloadCsv } from '@/lib/csv'
import { formatDateTime, manilaDateStamp } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { AdminResult, GuestOverviewRow, TeamStats } from '@/types/db'

const GUEST_COLUMNS =
  'id, name, team_id, team, site, created_at, checked_in_at, checked_in_method, voided, void_reason, cocktail_claimed, bundle_claimed'
const PAGE_SIZE = 50
const EXPORT_PAGE_SIZE = 1000

type StatusFilter = 'all' | 'registered' | 'checked_in' | 'voided'
type ClaimFilter = 'all' | 'yes' | 'no'

const STATUS_VALUES: StatusFilter[] = ['all', 'registered', 'checked_in', 'voided']
const CLAIM_VALUES: ClaimFilter[] = ['all', 'yes', 'no']

const statusOptions = [
  { value: 'all', label: 'All' },
  { value: 'registered', label: 'Registered' },
  { value: 'checked_in', label: 'Checked in' },
  { value: 'voided', label: 'Voided' },
]

const claimOptions = [
  { value: 'all', label: 'All' },
  { value: 'yes', label: 'Claimed' },
  { value: 'no', label: 'Not claimed' },
]

type GuestAction = 'void' | 'restore' | 'undo_check_in' | 'undo_claim_cocktail' | 'undo_claim_bundle'

const SHORT_LABELS: Record<GuestAction, string> = {
  void: 'Void',
  restore: 'Restore',
  undo_check_in: 'Undo check-in',
  undo_claim_cocktail: 'Undo cocktail',
  undo_claim_bundle: 'Undo bundle',
}

function readFilter<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

function guestStatus(guest: GuestOverviewRow): { label: string; tone: StatusTone } {
  if (guest.voided) return { label: 'Voided', tone: 'stop' }
  if (guest.checked_in_at) return { label: 'Checked in', tone: 'success' }
  return { label: 'Registered', tone: 'neutral' }
}

function availableActions(guest: GuestOverviewRow): GuestAction[] {
  if (guest.voided) return ['restore']

  const actions: GuestAction[] = ['void']
  if (guest.checked_in_at) actions.push('undo_check_in')
  if (guest.cocktail_claimed) actions.push('undo_claim_cocktail')
  if (guest.bundle_claimed) actions.push('undo_claim_bundle')
  return actions
}

function dialogCopy(action: GuestAction, name: string) {
  switch (action) {
    case 'void':
      return {
        title: `Void ${name}?`,
        description: 'A voided guest cannot check in or claim anything.',
        confirmLabel: 'Void guest',
        requireReason: true,
        destructive: true,
      }
    case 'restore':
      return {
        title: `Restore ${name}?`,
        description: 'The guest becomes active again.',
        confirmLabel: 'Restore',
        requireReason: false,
        destructive: false,
      }
    case 'undo_check_in':
      return {
        title: `Undo check-in for ${name}?`,
        description: 'Blocked while the guest has claims or an active win.',
        confirmLabel: 'Undo check-in',
        requireReason: true,
        destructive: true,
      }
    case 'undo_claim_cocktail':
      return {
        title: `Undo cocktail claim for ${name}?`,
        description: 'The claim is removed and can be claimed again.',
        confirmLabel: 'Undo cocktail',
        requireReason: true,
        destructive: true,
      }
    case 'undo_claim_bundle':
      return {
        title: `Undo Bundle of Joy claim for ${name}?`,
        description: 'The claim is removed and can be claimed again.',
        confirmLabel: 'Undo bundle',
        requireReason: true,
        destructive: true,
      }
  }
}

function GuestActions({
  guest,
  onAction,
  stacked = false,
}: {
  guest: GuestOverviewRow
  onAction: (guest: GuestOverviewRow, action: GuestAction) => void
  stacked?: boolean
}) {
  const actions = availableActions(guest)
  if (actions.length === 0) return <span className="text-xs text-muted-foreground">—</span>

  if (stacked) {
    return (
      <div className="flex flex-col gap-1.5">
        {actions.map((action) => (
          <Button
            key={action}
            type="button"
            variant="outline"
            size="sm"
            className="h-11 w-full text-sm"
            onClick={() => onAction(guest, action)}
          >
            {SHORT_LABELS[action]}
          </Button>
        ))}
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className="flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Actions for ${guest.name}`}
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <DropdownMenuItem
            key={action}
            destructive={action === 'void'}
            onClick={() => onAction(guest, action)}
          >
            {SHORT_LABELS[action]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function GuestsPage() {
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<{ guest: GuestOverviewRow; action: GuestAction } | null>(null)
  const [pending, setPending] = useState(false)
  const [exporting, setExporting] = useState(false)
  const searchTimer = useRef<number | null>(null)

  const teamFilter = params.get('team') ?? ''
  const rawSite = params.get('site')
  const siteFilter = rawSite === 'Toledo' || rawSite === 'Talisay' ? rawSite : ''
  const query = params.get('q') ?? ''
  const status = readFilter(params.get('status'), STATUS_VALUES, 'all')
  const cocktail = readFilter(params.get('cocktail'), CLAIM_VALUES, 'all')
  const bundle = readFilter(params.get('bundle'), CLAIM_VALUES, 'all')
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  useEffect(() => {
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current)
    }
  }, [])

  function updateFilters(next: Record<string, string | null>) {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        for (const [key, value] of Object.entries(next)) {
          if (value) updated.set(key, value)
          else updated.delete(key)
        }
        if (!('page' in next)) updated.delete('page')
        return updated
      },
      { replace: true },
    )
  }

  const teamStats = useQuery({
    queryKey: ['team_stats'],
    queryFn: async (): Promise<TeamStats[]> => {
      const { data, error } = await supabase.rpc('team_stats')
      if (error) throw error
      return (data ?? []) as TeamStats[]
    },
    staleTime: 60_000,
  })

  const teamRows = teamStats.data ?? []
  const toledoTeams = teamRows.filter((team) => team.site === 'Toledo')
  const talisayTeams = teamRows.filter((team) => team.site === 'Talisay')
  const unassignedTeam = teamRows.find((team) => team.site === 'Unassigned')
  const siteTeamIds =
    teamFilter || !siteFilter
      ? null
      : teamRows
          .filter((team) => team.site === siteFilter)
          .map((team) => team.id)
          .filter((id): id is string => id !== null)
  const teamsReady = !siteFilter || teamStats.data !== undefined

  const teamSelectValue =
    teamFilter === 'none'
      ? 'team:none'
      : teamFilter
        ? `team:${teamFilter}`
        : siteFilter
          ? `site:${siteFilter}`
          : 'all'

  function onTeamChange(value: string) {
    if (value.startsWith('site:')) updateFilters({ team: null, site: value.slice(5) })
    else if (value.startsWith('team:')) updateFilters({ team: value.slice(5), site: null })
    else updateFilters({ team: null, site: null })
  }

  function onSearchChange(value: string) {
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
    searchTimer.current = window.setTimeout(() => {
      updateFilters({ q: value.trim() || null })
    }, 300)
  }

  function buildGuestsQuery(
    from: number,
    to: number,
    applyFilters: boolean,
    exportCursor?: { afterId: string | null },
  ) {
    let request = supabase.from('guest_overview').select(GUEST_COLUMNS, { count: 'exact' })

    if (applyFilters) {
      if (teamFilter === 'none') request = request.is('team_id', null)
      else if (teamFilter) request = request.eq('team_id', teamFilter)
      else if (siteTeamIds) {
        request =
          siteTeamIds.length > 0
            ? request.in('team_id', siteTeamIds)
            : request.eq('team_id', '00000000-0000-0000-0000-000000000000')
      }

      if (query.trim()) request = request.ilike('name', `%${escapeLike(query.trim())}%`)
      if (status === 'registered') request = request.is('checked_in_at', null).eq('voided', false)
      if (status === 'checked_in') request = request.not('checked_in_at', 'is', null).eq('voided', false)
      if (status === 'voided') request = request.eq('voided', true)
      if (cocktail !== 'all') request = request.eq('cocktail_claimed', cocktail === 'yes')
      if (bundle !== 'all') request = request.eq('bundle_claimed', bundle === 'yes')
    }

    if (exportCursor?.afterId) request = request.gt('id', exportCursor.afterId)

    return request
      .order(exportCursor ? 'id' : 'name', { ascending: true })
      .range(from, to)
  }

  const guests = useQuery({
    queryKey: ['guest_overview', teamFilter, siteFilter, query, status, cocktail, bundle, page],
    enabled: teamsReady,
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE
      const { data, error, count } = await buildGuestsQuery(from, from + PAGE_SIZE - 1, true)
      if (error) throw error
      return { rows: (data ?? []) as GuestOverviewRow[], count: count ?? 0 }
    },
  })

  const rows = guests.data?.rows ?? []
  const total = guests.data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const end = Math.min(page * PAGE_SIZE, total)

  useEffect(() => {
    if (guests.isPending || guests.isPlaceholderData || !guests.data || page <= totalPages) return

    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        if (totalPages <= 1) updated.delete('page')
        else updated.set('page', String(totalPages))
        return updated
      },
      { replace: true },
    )
  }, [guests.data, guests.isPending, guests.isPlaceholderData, page, totalPages, setParams])

  function goToPage(next: number) {
    updateFilters({ page: next <= 1 ? null : String(next) })
  }

  async function runAction(reason: string) {
    if (!selected) return

    setPending(true)
    const { guest, action } = selected

    try {
      const { data, error } =
        action === 'void'
          ? await supabase.rpc('void_guest', { p_guest_id: guest.id, p_reason: reason })
          : action === 'restore'
            ? await supabase.rpc('restore_guest', { p_guest_id: guest.id })
            : action === 'undo_check_in'
              ? await supabase.rpc('undo_check_in', { p_guest_id: guest.id, p_reason: reason })
              : await supabase.rpc('undo_claim', {
                  p_guest_id: guest.id,
                  p_station: action === 'undo_claim_cocktail' ? 'cocktail' : 'bundle',
                  p_reason: reason,
                })

      if (error) {
        toast.error('Could not complete. Check the network and try again.')
        return
      }

      const result = data as AdminResult
      if (!result.ok) {
        toast.error(result.message)
        return
      }

      toast.success('Done.')
      setSelected(null)
      void queryClient.invalidateQueries({ queryKey: ['guest_overview'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] })
      void queryClient.invalidateQueries({ queryKey: ['team_stats'] })
    } catch {
      toast.error('Could not complete. Check the network and try again.')
    } finally {
      setPending(false)
    }
  }

  async function collectGuests(applyFilters: boolean) {
    const all: GuestOverviewRow[] = []
    let afterId: string | null = null

    // Cursor on the primary key keeps batches stable while rows are inserted mid-export.
    for (;;) {
      const { data, error } = await buildGuestsQuery(0, EXPORT_PAGE_SIZE - 1, applyFilters, {
        afterId,
      })
      if (error) throw error

      const pageRows = (data ?? []) as GuestOverviewRow[]
      all.push(...pageRows)
      if (pageRows.length < EXPORT_PAGE_SIZE) break
      afterId = pageRows[pageRows.length - 1].id
    }

    return all.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  }

  async function exportGuests(applyFilters: boolean) {
    if (applyFilters && !teamsReady) {
      toast.error('Team list is not ready. Try again.')
      return
    }

    setExporting(true)

    try {
      const exportRows = await collectGuests(applyFilters)
      const csv: string[][] = [
        [
          'Name',
          'Team',
          'Site',
          'Registered at',
          'Checked in at',
          'Status',
          'Cocktail',
          'Bundle',
          'Voided',
        ],
      ]

      for (const guest of exportRows) {
        csv.push([
          guest.name,
          guest.team ?? 'Unassigned',
          guest.site ?? '',
          formatDateTime(guest.created_at),
          guest.checked_in_at ? formatDateTime(guest.checked_in_at) : '',
          guestStatus(guest).label,
          guest.cocktail_claimed ? 'Yes' : 'No',
          guest.bundle_claimed ? 'Yes' : 'No',
          guest.voided ? 'Yes' : 'No',
        ])
      }

      downloadCsv(`kjba-guests-${manilaDateStamp()}.csv`, csv)
      await supabase.rpc('log_admin_action', {
        p_action: 'export_guests',
        p_details: applyFilters
          ? {
              team: teamFilter || null,
              site: siteFilter || null,
              q: query || null,
              status,
              cocktail,
              bundle,
            }
          : {},
      })
      toast.success('CSV downloaded.')
    } catch {
      toast.error('Export failed. Check the network and try again.')
    } finally {
      setExporting(false)
    }
  }

  const hasActiveFilters = Boolean(
    teamFilter || siteFilter || query.trim() || status !== 'all' || cocktail !== 'all' || bundle !== 'all',
  )

  const filteredExportLabel = !hasActiveFilters
    ? null
    : teamFilter === 'none'
      ? 'Export filtered (CSV)'
      : teamFilter
        ? 'Export this team (CSV)'
        : siteFilter
          ? 'Export this site (CSV)'
          : 'Export filtered (CSV)'

  const copy = selected ? dialogCopy(selected.action, selected.guest.name) : null

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Guest Management</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="h-11 px-4 text-base"
            disabled={exporting || guests.isPending}
            onClick={() => void exportGuests(false)}
          >
            <Download className="size-4" aria-hidden />
            {exporting ? 'Exporting…' : 'Export all (CSV)'}
          </Button>
          {filteredExportLabel ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 px-4 text-base"
              disabled={exporting || guests.isPending || !teamsReady}
              onClick={() => void exportGuests(true)}
            >
              <Download className="size-4" aria-hidden />
              {exporting ? 'Exporting…' : filteredExportLabel}
            </Button>
          ) : null}
        </div>
      </div>

      <SelectField
        id="guest-team-filter"
        label="Team"
        value={teamSelectValue}
        onValueChange={onTeamChange}
        groups={[
          {
            label: '',
            options: [
              { value: 'all', label: 'All teams' },
              { value: 'site:Toledo', label: 'Toledo (all teams)' },
              { value: 'site:Talisay', label: 'Talisay (all teams)' },
            ],
          },
          {
            label: 'Toledo Team',
            options: toledoTeams.flatMap((team) =>
              team.id
                ? [{ value: `team:${team.id}`, label: `${team.name} (${team.registered})` }]
                : [],
            ),
          },
          {
            label: 'Talisay Team',
            options: talisayTeams.flatMap((team) =>
              team.id
                ? [{ value: `team:${team.id}`, label: `${team.name} (${team.registered})` }]
                : [],
            ),
          },
          ...(unassignedTeam
            ? [
                {
                  label: '',
                  options: [
                    {
                      value: 'team:none',
                      label: `Unassigned (${unassignedTeam.registered})`,
                    },
                  ],
                },
              ]
            : []),
        ]}
      />

      {teamStats.isError ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>Could not load team counts. The team filter may be incomplete.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2.5 text-xs"
            onClick={() => void teamStats.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : null}

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Search
        <input
          defaultValue={query}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Guest name"
          autoComplete="off"
          enterKeyHint="search"
          className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField
          id="guest-status-filter"
          label="Status"
          value={status}
          onValueChange={(next) => updateFilters({ status: next === 'all' ? null : next })}
          options={statusOptions}
        />
        <SelectField
          id="guest-cocktail-filter"
          label="Cocktail"
          value={cocktail}
          onValueChange={(next) => updateFilters({ cocktail: next === 'all' ? null : next })}
          options={claimOptions}
        />
        <SelectField
          id="guest-bundle-filter"
          label="Bundle of Joy"
          value={bundle}
          onValueChange={(next) => updateFilters({ bundle: next === 'all' ? null : next })}
          options={claimOptions}
        />
      </div>

      {siteFilter && !teamsReady ? (
        <p className="text-sm text-muted-foreground">
          {teamStats.isError
            ? 'Could not load team membership. Use Try again above to view this site.'
            : 'Loading team membership…'}
        </p>
      ) : guests.isError && !guests.data ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">Could not load guests.</p>
          <Button
            type="button"
            variant="outline"
            className="h-11 px-4 text-base"
            onClick={() => void guests.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : guests.isPending ? (
        <p className="text-sm text-muted-foreground">Loading guests…</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? 'No guests match these filters.'
              : `Showing ${start} to ${end} of ${total} guests`}
          </p>

          {rows.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              No guests match these filters.
            </p>
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Team</th>
                      <th className="px-3 py-2 font-medium">Site</th>
                      <th className="px-3 py-2 font-medium">Registered</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Cocktail</th>
                      <th className="px-3 py-2 font-medium">Bundle</th>
                      <th className="w-1 px-3 py-2 text-end font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((guest) => {
                      const guestState = guestStatus(guest)

                      return (
                        <tr key={guest.id}>
                          <td className="px-3 py-2 font-medium whitespace-nowrap">
                            {guest.name}
                          </td>
                          <td className="max-w-[200px] px-3 py-2 truncate text-muted-foreground">
                            {guest.team ?? 'Unassigned'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                            {guest.site ?? '—'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                            {formatDateTime(guest.created_at)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <StatusBadge tone={guestState.tone}>{guestState.label}</StatusBadge>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {guest.cocktail_claimed ? 'Yes' : 'No'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {guest.bundle_claimed ? 'Yes' : 'No'}
                          </td>
                          <td className="w-1 px-3 py-2 text-end whitespace-nowrap">
                            <div className="flex justify-end">
                              <GuestActions
                                guest={guest}
                                onAction={(g, action) => setSelected({ guest: g, action })}
                              />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="flex flex-col gap-2 md:hidden">
                {rows.map((guest) => {
                  const guestState = guestStatus(guest)

                  return (
                    <li
                      key={guest.id}
                      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-base font-medium break-words">{guest.name}</span>
                        <StatusBadge tone={guestState.tone}>{guestState.label}</StatusBadge>
                      </div>

                      <p className="text-sm text-muted-foreground">
                        {guest.team ?? 'Unassigned'}
                        {guest.site ? ` · ${guest.site}` : ''}
                      </p>

                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                        <div>
                          <dt className="text-xs text-muted-foreground">Registered</dt>
                          <dd>{formatDateTime(guest.created_at)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Cocktail</dt>
                          <dd>{guest.cocktail_claimed ? 'Yes' : 'No'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Bundle of Joy</dt>
                          <dd>{guest.bundle_claimed ? 'Yes' : 'No'}</dd>
                        </div>
                      </dl>

                      <GuestActions
                        guest={guest}
                        stacked
                        onAction={(g, action) => setSelected({ guest: g, action })}
                      />
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Previous page"
                disabled={page <= 1 || guests.isFetching}
                onClick={() => goToPage(page - 1)}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Next page"
                disabled={page >= totalPages || guests.isFetching}
                onClick={() => goToPage(page + 1)}
              >
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={selected !== null}
        title={copy?.title ?? ''}
        description={copy?.description}
        confirmLabel={copy?.confirmLabel}
        destructive={copy?.destructive}
        requireReason={copy?.requireReason}
        pending={pending}
        onConfirm={(reason) => void runAction(reason)}
        onCancel={() => {
          if (!pending) setSelected(null)
        }}
      />
    </section>
  )
}

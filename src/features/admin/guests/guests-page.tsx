import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { StatusBadge, type StatusTone } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { downloadCsv } from '@/lib/csv'
import { formatDateTime, manilaDateStamp } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { AdminResult, GuestOverviewRow } from '@/types/db'

const GUEST_COLUMNS =
  'id, name, created_at, checked_in_at, checked_in_method, voided, void_reason, cocktail_claimed, bundle_claimed'

type StatusFilter = 'all' | 'registered' | 'checked_in' | 'voided'
type ClaimFilter = 'all' | 'yes' | 'no'

type GuestAction = 'void' | 'restore' | 'undo_check_in' | 'undo_claim_cocktail' | 'undo_claim_bundle'

const SHORT_LABELS: Record<GuestAction, string> = {
  void: 'Void',
  restore: 'Restore',
  undo_check_in: 'Undo check-in',
  undo_claim_cocktail: 'Undo cocktail',
  undo_claim_bundle: 'Undo bundle',
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

  return (
    <div className={cn('flex flex-wrap gap-1.5', stacked && 'flex-col')}>
      {actions.map((action) => (
        <Button
          key={action}
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-8 px-2.5 text-xs', stacked && 'h-11 w-full text-sm')}
          onClick={() => onAction(guest, action)}
        >
          {SHORT_LABELS[action]}
        </Button>
      ))}
    </div>
  )
}

export function GuestsPage() {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [cocktail, setCocktail] = useState<ClaimFilter>('all')
  const [bundle, setBundle] = useState<ClaimFilter>('all')
  const [selected, setSelected] = useState<{ guest: GuestOverviewRow; action: GuestAction } | null>(null)
  const [pending, setPending] = useState(false)
  const [exporting, setExporting] = useState(false)

  const guests = useQuery({
    queryKey: ['guest_overview'],
    queryFn: async (): Promise<GuestOverviewRow[]> => {
      const { data, error } = await supabase
        .from('guest_overview')
        .select(GUEST_COLUMNS)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as GuestOverviewRow[]
    },
  })

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()

    return (guests.data ?? []).filter((guest) => {
      if (term && !guest.name.toLowerCase().includes(term)) return false

      if (status === 'registered' && (guest.checked_in_at || guest.voided)) return false
      if (status === 'checked_in' && !guest.checked_in_at) return false
      if (status === 'voided' && !guest.voided) return false

      if (cocktail === 'yes' && !guest.cocktail_claimed) return false
      if (cocktail === 'no' && guest.cocktail_claimed) return false
      if (bundle === 'yes' && !guest.bundle_claimed) return false
      if (bundle === 'no' && guest.bundle_claimed) return false

      return true
    })
  }, [bundle, cocktail, guests.data, query, status])

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
    } catch {
      toast.error('Could not complete. Check the network and try again.')
    } finally {
      setPending(false)
    }
  }

  async function exportGuests() {
    setExporting(true)

    try {
      const { data, error } = await supabase
        .from('guest_overview')
        .select(GUEST_COLUMNS)
        .order('name', { ascending: true })

      if (error) throw error

      const rows: string[][] = [
        ['Name', 'Registered at', 'Checked in at', 'Status', 'Cocktail', 'Bundle', 'Voided'],
      ]

      for (const guest of (data ?? []) as GuestOverviewRow[]) {
        rows.push([
          guest.name,
          formatDateTime(guest.created_at),
          guest.checked_in_at ? formatDateTime(guest.checked_in_at) : '',
          guestStatus(guest).label,
          guest.cocktail_claimed ? 'Yes' : 'No',
          guest.bundle_claimed ? 'Yes' : 'No',
          guest.voided ? 'Yes' : 'No',
        ])
      }

      downloadCsv(`kjba-guests-${manilaDateStamp()}.csv`, rows)
      await supabase.rpc('log_admin_action', { p_action: 'export_guests' })
      toast.success('CSV downloaded.')
    } catch {
      toast.error('Export failed. Check the network and try again.')
    } finally {
      setExporting(false)
    }
  }

  const copy = selected ? dialogCopy(selected.action, selected.guest.name) : null

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Guests</h1>
        <Button
          type="button"
          className="h-11 px-4 text-base"
          disabled={exporting || guests.isPending}
          onClick={() => void exportGuests()}
        >
          <Download className="size-4" aria-hidden />
          {exporting ? 'Exporting…' : 'Export all (CSV)'}
        </Button>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Search
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Guest name"
          autoComplete="off"
          className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All</option>
            <option value="registered">Registered</option>
            <option value="checked_in">Checked in</option>
            <option value="voided">Voided</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Cocktail
          <select
            value={cocktail}
            onChange={(event) => setCocktail(event.target.value as ClaimFilter)}
            className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All</option>
            <option value="yes">Claimed</option>
            <option value="no">Not claimed</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Bundle of Joy
          <select
            value={bundle}
            onChange={(event) => setBundle(event.target.value as ClaimFilter)}
            className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All</option>
            <option value="yes">Claimed</option>
            <option value="no">Not claimed</option>
          </select>
        </label>
      </div>

      {guests.isError && !guests.data ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">Could not load guests.</p>
          <Button type="button" variant="outline" className="h-11 px-4 text-base" onClick={() => void guests.refetch()}>
            Try again
          </Button>
        </div>
      ) : guests.isPending ? (
        <p className="text-sm text-muted-foreground">Loading guests…</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {(guests.data ?? []).length} guests
          </p>

          {filtered.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              No guests match these filters.
            </p>
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Registered</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Cocktail</th>
                      <th className="px-3 py-2 font-medium">Bundle</th>
                      <th className="px-3 py-2 text-end font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((guest) => {
                      const guestState = guestStatus(guest)

                      return (
                        <tr key={guest.id}>
                          <td className="max-w-[220px] px-3 py-2 font-medium break-words">{guest.name}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                            {formatDateTime(guest.created_at)}
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge tone={guestState.tone}>{guestState.label}</StatusBadge>
                          </td>
                          <td className="px-3 py-2">{guest.cocktail_claimed ? 'Yes' : 'No'}</td>
                          <td className="px-3 py-2">{guest.bundle_claimed ? 'Yes' : 'No'}</td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end">
                              <GuestActions guest={guest} onAction={(g, action) => setSelected({ guest: g, action })} />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="flex flex-col gap-2 md:hidden">
                {filtered.map((guest) => {
                  const guestState = guestStatus(guest)

                  return (
                    <li key={guest.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-base font-medium break-words">{guest.name}</span>
                        <StatusBadge tone={guestState.tone}>{guestState.label}</StatusBadge>
                      </div>

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

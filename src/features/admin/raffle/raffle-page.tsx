import { useEffect, useId, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Download, Plus, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { SelectField } from '@/components/common/select-field'
import { formatDateTime, manilaDateStamp } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { AdminResult, RafflePoolEntry, SettingsRow, WinnerWithGuest } from '@/types/db'

const WINNER_COLUMNS =
  'id, guest_id, prize, drawn_at, drawn_by, voided, void_reason, voided_at, return_to_pool, guests(name)'

type RaffleWinner = Omit<WinnerWithGuest, 'guests'> & { guest_name: string | null }

type RawWinner = Omit<WinnerWithGuest, 'guests'> & {
  guests: { name: string } | { name: string }[] | null
}

function winnerGuestName(guests: RawWinner['guests']): string | null {
  if (!guests) return null
  return Array.isArray(guests) ? (guests[0]?.name ?? null) : guests.name
}

function copyWithFallback(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)

  try {
    area.select()
    area.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function AddWinnerDialog({
  open,
  pool,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  open: boolean
  pool: RafflePoolEntry[]
  pending: boolean
  error: string | null
  onSubmit: (guestId: string, prize: string) => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const portalContainerRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const guestId = useId()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [prize, setPrize] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      setSelectedId(null)
      setPrize('')
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const selected = pool.find((entry) => entry.id === selectedId) ?? null

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        if (!pending) onCancel()
      }}
      className="relative m-auto w-[calc(100%-2rem)] max-w-md overflow-visible rounded-xl border border-border bg-card p-0 text-card-foreground backdrop:bg-foreground/40"
    >
      <div ref={portalContainerRef} className="pointer-events-none absolute inset-0 overflow-visible" />
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (selected && prize.trim()) onSubmit(selected.id, prize.trim())
        }}
        className="flex flex-col gap-4 p-5"
      >
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-lg font-semibold">
            Add winner
          </h2>
          <p className="text-sm text-muted-foreground">Choose a guest from the pool, then enter the prize.</p>
        </div>

        <SelectField
          id={guestId}
          label="Guest"
          value={selectedId}
          onValueChange={setSelectedId}
          options={pool.map((entry) => ({ value: entry.id, label: entry.name }))}
          placeholder={pool.length === 0 ? 'No eligible guests' : 'Select a guest'}
          disabled={pool.length === 0}
          container={portalContainerRef}
        />

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Prize
          <input
            value={prize}
            onChange={(event) => setPrize(event.target.value)}
            maxLength={120}
            required
            placeholder="e.g. Grand prize"
            className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        {error ? (
          <p role="alert" className="rounded-lg bg-[var(--stop-soft)] px-3 py-2 text-sm text-[var(--stop-text)]">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 px-4 text-base"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="h-11 px-4 text-base"
            disabled={pending || !selected || prize.trim() === ''}
          >
            {pending ? 'Saving…' : 'Add winner'}
          </Button>
        </div>
      </form>
    </dialog>
  )
}

export function RafflePage() {
  const queryClient = useQueryClient()
  const lockId = useId()
  const [addOpen, setAddOpen] = useState(false)
  const [addPending, setAddPending] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<RaffleWinner | null>(null)
  const [voidPending, setVoidPending] = useState(false)
  const [lockPending, setLockPending] = useState(false)
  const [confirmLock, setConfirmLock] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const pool = useQuery({
    queryKey: ['raffle_pool'],
    queryFn: async (): Promise<RafflePoolEntry[]> => {
      const { data, error } = await supabase.from('raffle_pool').select('id, name').order('name')

      if (error) throw error
      return (data ?? []) as RafflePoolEntry[]
    },
    refetchInterval: 5000,
  })

  const winners = useQuery({
    queryKey: ['winners'],
    queryFn: async (): Promise<RaffleWinner[]> => {
      const { data, error } = await supabase
        .from('winners')
        .select(WINNER_COLUMNS)
        .order('drawn_at', { ascending: false })

      if (error) throw error

      return ((data ?? []) as unknown as RawWinner[]).map((winner) => {
        const { guests, ...rest } = winner
        return { ...rest, guest_name: winnerGuestName(guests) }
      })
    },
    refetchInterval: 5000,
  })

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: async (): Promise<SettingsRow> => {
      const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single()

      if (error) throw error
      return data as SettingsRow
    },
  })

  async function fetchPool(): Promise<RafflePoolEntry[]> {
    const { data, error } = await supabase.from('raffle_pool').select('id, name').order('name')

    if (error) throw error
    return (data ?? []) as RafflePoolEntry[]
  }

  async function copyNames() {
    try {
      const entries = await fetchPool()

      if (entries.length === 0) {
        toast.error('Raffle pool is empty.')
        return
      }

      const text = entries.map((entry) => entry.name).join('\n')
      let copied = false

      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text)
          copied = true
        } catch {
          copied = false
        }
      }

      if (!copied) copied = copyWithFallback(text)

      if (!copied) {
        toast.error('Could not copy names. Use Download .txt instead.')
        return
      }

      toast.success(`Copied ${entries.length} names.`)
      const { error: logError } = await supabase.rpc('log_admin_action', {
        p_action: 'copy_raffle_names',
        p_details: { count: entries.length },
      })
      if (logError) toast.warning('Copied, but the audit log could not be written.')
    } catch {
      toast.error('Could not copy names. Check the network and try again.')
    }
  }

  async function downloadNames() {
    setDownloading(true)

    try {
      const entries = await fetchPool()

      if (entries.length === 0) {
        toast.error('Raffle pool is empty.')
        return
      }

      downloadText(
        `kjba-raffle-${manilaDateStamp()}.txt`,
        entries.map((entry) => entry.name).join('\r\n'),
      )
      toast.success(`Downloaded ${entries.length} names.`)
    } catch {
      toast.error('Download failed. Check the network and try again.')
    } finally {
      setDownloading(false)
    }
  }

  async function recordWinner(guestId: string, prize: string) {
    setAddPending(true)
    setAddError(null)

    try {
      const { data, error } = await supabase.rpc('record_winner', {
        p_guest_id: guestId,
        p_prize: prize,
      })

      if (error) {
        setAddError('Could not record the winner. Check the network and try again.')
        return
      }

      const result = data as AdminResult
      if (!result.ok) {
        setAddError(result.message)
        return
      }

      toast.success('Winner recorded.')
      setAddOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['raffle_pool'] })
      void queryClient.invalidateQueries({ queryKey: ['winners'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] })
    } catch {
      setAddError('Could not record the winner. Check the network and try again.')
    } finally {
      setAddPending(false)
    }
  }

  async function voidWinner(reason: string, returnToPool: boolean) {
    if (!voidTarget) return

    setVoidPending(true)

    try {
      const { data, error } = await supabase.rpc('void_winner', {
        p_winner_id: voidTarget.id,
        p_reason: reason,
        p_return_to_pool: returnToPool,
      })

      if (error) {
        toast.error('Could not void the winner. Check the network and try again.')
        return
      }

      const result = data as AdminResult
      if (!result.ok) {
        toast.error(result.message)
        return
      }

      toast.success(returnToPool ? 'Winner voided and returned to the pool.' : 'Winner voided.')
      setVoidTarget(null)
      void queryClient.invalidateQueries({ queryKey: ['raffle_pool'] })
      void queryClient.invalidateQueries({ queryKey: ['winners'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] })
    } catch {
      toast.error('Could not void the winner. Check the network and try again.')
    } finally {
      setVoidPending(false)
    }
  }

  async function updateLock(locked: boolean) {
    setLockPending(true)

    try {
      const { data, error } = await supabase
        .from('settings')
        .update({ raffle_locked: locked, updated_at: new Date().toISOString() })
        .eq('id', 1)
        .select('id')

      if (error || !data || data.length === 0) {
        toast.error('Could not update the raffle lock. Check the network and try again.')
        return
      }

      toast.success(locked ? 'Raffle pool locked. Check-in is blocked.' : 'Raffle pool unlocked.')
      setConfirmLock(false)
      void queryClient.invalidateQueries({ queryKey: ['settings'] })
      const { error: logError } = await supabase.rpc('log_admin_action', {
        p_action: 'update_settings',
        p_details: { raffle_locked: locked },
      })
      if (logError) toast.warning('Raffle lock saved, but the audit log could not be written.')
    } catch {
      toast.error('Could not update the raffle lock. Check the network and try again.')
    } finally {
      setLockPending(false)
    }
  }

  const locked = settings.data?.raffle_locked ?? false
  const winnerRows = winners.data ?? []
  const poolCount = pool.data?.length
  const hasPool = (poolCount ?? 0) > 0

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Raffle Management</h1>
        <Button
          type="button"
          className="h-11 px-4 text-base"
          disabled={pool.isPending || !hasPool}
          onClick={() => {
            setAddError(null)
            setAddOpen(true)
            void pool.refetch()
          }}
        >
          <Plus className="size-4" aria-hidden />
          Add winner
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        The wheel is an external site. Record winners here manually.
      </p>

      <div className="grid overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-[3fr_2fr]">
        <div className="flex min-w-0 flex-col gap-2.5 px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">Raffle pool</h2>
            <div className="flex shrink-0 items-baseline gap-1.5">
              <span className="text-2xl font-semibold leading-none tabular-nums">
                {poolCount === undefined ? '—' : poolCount.toLocaleString()}
              </span>
              <span className="text-xs font-medium text-muted-foreground">eligible</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Checked in · not voided · not yet won.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="h-11 px-4 text-base"
              disabled={pool.isPending || !hasPool}
              onClick={() => void copyNames()}
            >
              <Copy className="size-4" aria-hidden />
              Copy raffle names
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 px-4 text-base text-muted-foreground hover:text-foreground"
              disabled={pool.isPending || downloading || !hasPool}
              onClick={() => void downloadNames()}
            >
              <Download className="size-4" aria-hidden />
              {downloading ? 'Downloading…' : 'Download names'}
            </Button>
          </div>
          {!pool.isPending && !hasPool && !pool.isError ? (
            <p className="text-xs text-muted-foreground">
              No eligible guests yet. Check in guests at the entrance.
            </p>
          ) : null}
          {pool.isError && !pool.data ? (
            <div className="flex items-center gap-2">
              <p className="text-xs text-destructive">Could not load the raffle pool.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => void pool.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-2.5 border-t border-border px-4 py-3 lg:border-t-0 lg:border-l">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Pool lock</h2>
            <StatusBadge tone={locked ? 'stop' : 'success'} className="shrink-0">
              {locked ? 'Locked' : 'Open'}
            </StatusBadge>
          </div>
          <p className="text-sm text-muted-foreground">
            While locked, nobody can check in. Existing claims are unaffected.
          </p>
          <div className="mt-auto flex items-center justify-between gap-3">
            <label htmlFor={lockId} className="text-sm font-medium">
              Lock raffle pool
            </label>
            <Switch
              id={lockId}
              aria-label="Lock raffle pool"
              checked={locked}
              disabled={settings.isPending || lockPending || !settings.data}
              onCheckedChange={(next) => {
                if (next) setConfirmLock(true)
                else void updateLock(false)
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Winners log</h2>

        {winners.isError && !winners.data ? (
          <p className="text-sm text-muted-foreground">Could not load winners.</p>
        ) : winners.isPending ? (
          <p className="text-sm text-muted-foreground">Loading winners…</p>
        ) : winnerRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Trophy className="size-5" aria-hidden />
            </span>
            <p className="text-sm font-medium">No winners recorded yet</p>
            <p className="text-xs text-muted-foreground">
              After each wheel spin, record the winner here.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Prize</th>
                    <th className="px-3 py-2 font-medium">Drawn at</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 text-end font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {winnerRows.map((winner) => (
                    <tr key={winner.id}>
                      <td className="px-3 py-3 font-medium break-words">{winner.guest_name ?? '—'}</td>
                      <td className="px-3 py-3 break-words">{winner.prize}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                        {formatDateTime(winner.drawn_at)}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge tone={winner.voided ? 'stop' : 'success'}>
                          {winner.voided ? 'Voided' : 'Winner'}
                        </StatusBadge>
                        {winner.voided && winner.void_reason ? (
                          <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">{winner.void_reason}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end">
                          {winner.voided ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setVoidTarget(winner)}
                            >
                              Void
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="flex flex-col gap-2 md:hidden">
              {winnerRows.map((winner) => (
                <li key={winner.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-base font-medium break-words">{winner.guest_name ?? '—'}</span>
                    <StatusBadge tone={winner.voided ? 'stop' : 'success'}>
                      {winner.voided ? 'Voided' : 'Winner'}
                    </StatusBadge>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Prize</dt>
                      <dd>{winner.prize}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Drawn at</dt>
                      <dd>{formatDateTime(winner.drawn_at)}</dd>
                    </div>
                  </dl>
                  {winner.voided && winner.void_reason ? (
                    <p className="text-xs text-muted-foreground">Reason: {winner.void_reason}</p>
                  ) : null}
                  {winner.voided ? null : (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-full text-base text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setVoidTarget(winner)}
                    >
                      Void winner
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <AddWinnerDialog
        open={addOpen}
        pool={pool.data ?? []}
        pending={addPending}
        error={addError}
        onSubmit={(guestId, prize) => void recordWinner(guestId, prize)}
        onCancel={() => {
          if (!addPending) {
            setAddOpen(false)
            setAddError(null)
          }
        }}
      />

      <ConfirmDialog
        open={voidTarget !== null}
        title={voidTarget ? `Void ${voidTarget.guest_name ?? 'this winner'}?` : ''}
        description="The winner stays in the log as voided."
        confirmLabel="Void winner"
        destructive
        requireReason
        checkboxLabel="Put back in raffle pool (wrong entry)"
        pending={voidPending}
        onConfirm={(reason, checked) => void voidWinner(reason, checked)}
        onCancel={() => {
          if (!voidPending) setVoidTarget(null)
        }}
      />

      <ConfirmDialog
        open={confirmLock}
        title="Lock the raffle pool?"
        description="No one can check in while the pool is locked. Unlock it after the raffle."
        confirmLabel="Lock pool"
        destructive
        pending={lockPending}
        onConfirm={() => void updateLock(true)}
        onCancel={() => {
          if (!lockPending) setConfirmLock(false)
        }}
      />
    </section>
  )
}

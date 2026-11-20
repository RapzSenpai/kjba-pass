import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import type { SearchGuest, Station } from '@/types/db'

const actionLabels: Record<Station, { action: string; done: string }> = {
  entrance: { action: 'Check in', done: 'Checked in' },
  cocktail: { action: 'Claim cocktail', done: 'Claimed' },
  bundle: { action: 'Claim Bundle of Joy', done: 'Claimed' },
}

function isDone(guest: SearchGuest, station: Station): boolean {
  if (station === 'entrance') return guest.checked_in_at !== null
  if (station === 'cocktail') return guest.cocktail_claimed
  return guest.bundle_claimed
}

function confirmTitle(guest: SearchGuest, station: Station): string {
  if (station === 'entrance') return `Check in ${guest.name}?`
  if (station === 'cocktail') return `Claim cocktail for ${guest.name}?`
  return `Claim Bundle of Joy for ${guest.name}?`
}

export function FindGuestPanel({
  station,
  pending,
  onAct,
}: {
  station: Station
  pending: boolean
  onAct: (identifier: string) => void
}) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState<SearchGuest | null>(null)
  const labels = actionLabels[station]

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const search = useQuery({
    queryKey: ['search_guests', debounced],
    enabled: debounced.length >= 3,
    queryFn: async (): Promise<SearchGuest[]> => {
      const { data, error } = await supabase.rpc('search_guests', { p_query: debounced })
      if (error) throw error
      return (data ?? []) as SearchGuest[]
    },
  })

  const results = search.data ?? []
  const tooShort = debounced.length < 3

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Guest name
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type at least 3 letters"
          autoComplete="off"
          enterKeyHint="search"
          className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      {tooShort ? (
        <p className="text-sm text-muted-foreground">Type at least 3 letters of the guest&apos;s name.</p>
      ) : null}

      {!tooShort && search.isPending ? (
        <p className="text-sm text-muted-foreground">Searching…</p>
      ) : null}

      {search.isError ? (
        <p role="alert" className="rounded-lg bg-[var(--stop-soft)] px-3 py-2 text-sm text-[var(--stop-text)]">
          Could not search. Check your connection and try again.
        </p>
      ) : null}

      {!tooShort && !search.isPending && !search.isError && results.length === 0 ? (
        <p className="text-sm text-muted-foreground">No guests found.</p>
      ) : null}

      {results.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {results.map((guest) => {
            const done = isDone(guest, station)

            return (
              <li key={guest.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="me-auto text-base font-medium break-words">{guest.name}</span>
                  {guest.checked_in_at ? <StatusBadge tone="success">Checked in</StatusBadge> : null}
                  {guest.cocktail_claimed ? <StatusBadge tone="success">Cocktail</StatusBadge> : null}
                  {guest.bundle_claimed ? <StatusBadge tone="success">Bundle</StatusBadge> : null}
                  {guest.voided ? <StatusBadge tone="stop">Voided</StatusBadge> : null}
                </div>
                <Button
                  type="button"
                  variant={done ? 'outline' : 'default'}
                  className="h-11 w-full text-base"
                  disabled={done || pending}
                  onClick={() => setSelected(guest)}
                >
                  {done ? labels.done : labels.action}
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}

      <ConfirmDialog
        open={selected !== null}
        title={selected ? confirmTitle(selected, station) : ''}
        description="This action is recorded in the activity log."
        confirmLabel={labels.action}
        pending={pending}
        onConfirm={() => {
          if (selected) onAct(selected.id)
          setSelected(null)
        }}
        onCancel={() => setSelected(null)}
      />
    </div>
  )
}

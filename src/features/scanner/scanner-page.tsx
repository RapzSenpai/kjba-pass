import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ResultCard } from '@/components/common/result-card'
import { SelectField } from '@/components/common/select-field'
import { Button } from '@/components/ui/button'
import { useSession } from '@/hooks/useSession'
import { useStaffProfile } from '@/hooks/useStaffProfile'
import { extractToken } from '@/lib/qr'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { ClaimMethod, Station, StationResult } from '@/types/db'
import { FindGuestPanel } from './find-guest-panel'
import { ScanPanel } from './scan-panel'

type Tab = 'scan' | 'code' | 'find'

const TAB_KEY = 'kjba_scanner_tab'

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'scan', label: 'Scan QR' },
  { id: 'code', label: 'Enter Code' },
  { id: 'find', label: 'Find Guest' },
]

const stationMeta: Record<Station, { label: string; badge: string }> = {
  entrance: { label: 'CHECK-IN', badge: 'bg-[var(--station-checkin)]' },
  cocktail: { label: 'COCKTAIL', badge: 'bg-[var(--station-cocktail)]' },
  bundle: { label: 'BUNDLE OF JOY', badge: 'bg-[var(--station-bundle)]' },
}

const stationOptions = [
  { value: 'entrance', label: 'Check-in' },
  { value: 'cocktail', label: 'Cocktail' },
  { value: 'bundle', label: 'Bundle of Joy' },
]

function readTab(): Tab {
  try {
    const stored = localStorage.getItem(TAB_KEY)
    return stored === 'code' || stored === 'find' ? stored : 'scan'
  } catch {
    return 'scan'
  }
}

export function ScannerPage() {
  const { session } = useSession()
  const profile = useStaffProfile(session?.user.id)
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<Tab>(readTab)
  const [stationOverride, setStationOverride] = useState<Station | null>(null)
  const [code, setCode] = useState('')
  const [result, setResult] = useState<StationResult | null>(null)
  const [rpcError, setRpcError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const pausedRef = useRef(false)
  const lastScanRef = useRef<{ value: string; at: number } | null>(null)

  const station: Station = stationOverride ?? profile.data?.station ?? 'entrance'
  const isAdmin = profile.data?.role === 'admin'

  const act = useCallback(
    async (identifier: string, method: ClaimMethod) => {
      setPending(true)
      setResult(null)
      setRpcError(null)

      try {
        const { data, error } =
          station === 'entrance'
            ? await supabase.rpc('check_in_guest', {
                p_identifier: identifier,
                p_method: method,
              })
            : await supabase.rpc('claim_station', {
                p_identifier: identifier,
                p_station: station,
                p_method: method,
              })

        if (error) {
          setRpcError('Connection problem. Check the network and try again.')
          return
        }

        setResult(data as StationResult)
        void queryClient.invalidateQueries({ queryKey: ['search_guests'] })
      } catch {
        setRpcError('Connection problem. Check the network and try again.')
      } finally {
        setPending(false)
      }
    },
    [queryClient, station],
  )

  const handleScan = useCallback(
    (scanned: string) => {
      const value = extractToken(scanned)
      if (!value || pausedRef.current) return

      const now = Date.now()
      const last = lastScanRef.current
      if (last && last.value === value && now - last.at < 3000) return

      lastScanRef.current = { value, at: now }
      pausedRef.current = true

      void act(value, 'scan').finally(() => {
        window.setTimeout(() => {
          pausedRef.current = false
        }, 2500)
      })
    },
    [act],
  )

  useEffect(() => {
    if (tab !== 'scan' || !result) return

    const timer = window.setTimeout(() => setResult(null), 3000)
    return () => window.clearTimeout(timer)
  }, [tab, result])

  function changeTab(next: Tab) {
    setTab(next)
    setResult(null)
    setRpcError(null)
    try {
      localStorage.setItem(TAB_KEY, next)
    } catch {
      // Tab choice just will not persist.
    }
  }

  function changeStation(next: Station) {
    setStationOverride(next)
    setResult(null)
    setRpcError(null)
  }

  if (profile.isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  const meta = stationMeta[station]

  return (
    <div className="flex flex-col gap-4">
      <div className={cn('rounded-xl px-4 py-3 text-center', meta.badge)}>
        <p className="text-3xl font-bold tracking-wide text-white">{meta.label}</p>
      </div>

      {isAdmin ? (
        <div className="flex items-center justify-between gap-3 text-sm font-medium">
          <span>Station</span>
          <SelectField
            ariaLabel="Station"
            value={station}
            onValueChange={(next) => changeStation(next as Station)}
            options={stationOptions}
            className="w-56"
          />
        </div>
      ) : null}

      {rpcError ? (
        <p role="alert" className="rounded-lg bg-[var(--stop-soft)] px-3 py-2 text-sm text-[var(--stop-text)]">
          {rpcError}
        </p>
      ) : null}

      <ResultCard result={result} onDismiss={() => setResult(null)} />

      <div role="tablist" aria-label="Scanner mode" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => changeTab(item.id)}
            className={cn(
              'h-11 rounded-lg text-sm font-medium',
              tab === item.id ? 'bg-background shadow-sm' : 'text-muted-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'scan' ? <ScanPanel onScan={handleScan} /> : null}

        {tab === 'code' ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (code.length === 6) void act(code, 'code')
            }}
            className="flex flex-col gap-3"
          >
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Backup code
              <input
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
                }
                placeholder="ABC123"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={6}
                className="h-14 w-full rounded-lg border border-input bg-background text-center font-mono text-2xl tracking-[0.4em] uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            <Button type="submit" className="h-11 w-full text-base" disabled={code.length !== 6 || pending}>
              {pending ? 'Checking…' : 'Submit code'}
            </Button>
          </form>
        ) : null}

        {tab === 'find' ? (
          <FindGuestPanel station={station} pending={pending} onAct={(identifier) => void act(identifier, 'manual')} />
        ) : null}
      </div>
    </div>
  )
}

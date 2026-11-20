import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { SelectField } from '@/components/common/select-field'
import { StatusBadge, type StatusTone } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/format'
import { actionLabels, methodLabels, stationLabels } from '@/lib/labels'
import { supabase } from '@/lib/supabase'
import type { ActivityLogRow, ClaimMethod, LogAction, Station } from '@/types/db'

const PAGE_SIZE = 50

type ResultFilter = 'all' | 'success' | 'already' | 'rejected'

const stationOptions = [
  { value: 'all', label: 'All' },
  ...(Object.keys(stationLabels) as Station[]).map((value) => ({
    value,
    label: stationLabels[value],
  })),
]

const methodOptions = [
  { value: 'all', label: 'All' },
  ...(Object.keys(methodLabels) as ClaimMethod[]).map((value) => ({
    value,
    label: methodLabels[value],
  })),
]

const resultOptions = [
  { value: 'all', label: 'All' },
  { value: 'success', label: 'Success' },
  { value: 'already', label: 'Already' },
  { value: 'rejected', label: 'Rejected' },
]

const actionOptions = [
  { value: 'all', label: 'All' },
  ...(Object.keys(actionLabels) as LogAction[]).map((value) => ({
    value,
    label: actionLabels[value],
  })),
]

function resultTone(result: string | null): StatusTone {
  if (result === 'success') return 'success'
  if (result === 'already') return 'action'
  return 'stop'
}

function resultLabel(result: string | null): string {
  if (result === 'success') return 'Success'
  if (result === 'already') return 'Already'
  if (result === 'rejected') return 'Rejected'
  return '—'
}

export function LogsPage() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [station, setStation] = useState<'all' | Station>('all')
  const [actor, setActor] = useState('')
  const [method, setMethod] = useState<'all' | ClaimMethod>('all')
  const [result, setResult] = useState<ResultFilter>('all')
  const [action, setAction] = useState<'all' | LogAction>('all')
  const [page, setPage] = useState(0)
  const [debouncedActor, setDebouncedActor] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedActor(actor.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [actor])

  useEffect(() => {
    setPage(0)
  }, [from, to, station, debouncedActor, method, result, action])

  const logs = useQuery({
    queryKey: ['activity_logs', from, to, station, debouncedActor, method, result, action, page],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: ActivityLogRow[]; count: number }> => {
      let request = supabase.from('activity_logs').select('*', { count: 'exact' })

      if (from) request = request.gte('created_at', `${from}T00:00:00+08:00`)
      if (to) request = request.lte('created_at', `${to}T23:59:59.999+08:00`)
      if (station !== 'all') request = request.eq('station', station)
      if (debouncedActor) request = request.ilike('actor_name', `%${debouncedActor}%`)
      if (method !== 'all') request = request.eq('method', method)
      if (result !== 'all') request = request.eq('result', result)
      if (action !== 'all') request = request.eq('action', action)

      const { data, error, count } = await request
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

      if (error) throw error
      return { rows: (data ?? []) as ActivityLogRow[], count: count ?? 0 }
    },
  })

  const rows = logs.data?.rows ?? []
  const total = logs.data?.count ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const firstRow = total === 0 ? 0 : page * PAGE_SIZE + 1
  const lastRow = Math.min(total, page * PAGE_SIZE + rows.length)

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Activity logs</h1>
        <span className="text-xs text-muted-foreground">Read-only · {total} rows</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          From (Manila)
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          To (Manila)
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <SelectField
          id="log-station-filter"
          label="Station"
          value={station}
          onValueChange={(next) => setStation(next as 'all' | Station)}
          options={stationOptions}
        />

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Actor
          <input
            value={actor}
            onChange={(event) => setActor(event.target.value)}
            placeholder="Staff or admin name"
            autoComplete="off"
            className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <SelectField
          id="log-method-filter"
          label="Method"
          value={method}
          onValueChange={(next) => setMethod(next as 'all' | ClaimMethod)}
          options={methodOptions}
        />

        <SelectField
          id="log-result-filter"
          label="Result"
          value={result}
          onValueChange={(next) => setResult(next as ResultFilter)}
          options={resultOptions}
        />

        <SelectField
          id="log-action-filter"
          label="Action"
          value={action}
          onValueChange={(next) => setAction(next as 'all' | LogAction)}
          options={actionOptions}
        />
      </div>

      {logs.isError && !logs.data ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">Could not load activity logs.</p>
          <Button
            type="button"
            variant="outline"
            className="h-11 px-4 text-base"
            onClick={() => void logs.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : logs.isPending ? (
        <p className="text-sm text-muted-foreground">Loading activity…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          No activity matches these filters.
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Actor</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Guest</th>
                  <th className="px-3 py-2 font-medium">Station</th>
                  <th className="px-3 py-2 font-medium">Method</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="px-3 py-2 break-words">{row.actor_name ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.actor_role ?? '—'}</td>
                    <td className="px-3 py-2">{actionLabels[row.action]}</td>
                    <td className="px-3 py-2 break-words">{row.guest_name ?? '—'}</td>
                    <td className="px-3 py-2">{row.station ? stationLabels[row.station] : '—'}</td>
                    <td className="px-3 py-2">{row.method ? methodLabels[row.method] : '—'}</td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={resultTone(row.result)}>{resultLabel(row.result)}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{actionLabels[row.action]}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</p>
                  </div>
                  <StatusBadge tone={resultTone(row.result)}>{resultLabel(row.result)}</StatusBadge>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Actor</dt>
                    <dd>{row.actor_name ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Role</dt>
                    <dd>{row.actor_role ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Guest</dt>
                    <dd className="break-words">{row.guest_name ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Station</dt>
                    <dd>{row.station ? stationLabels[row.station] : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Method</dt>
                    <dd>{row.method ? methodLabels[row.method] : '—'}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Showing {firstRow}–{lastRow} of {total}
              {logs.isFetching ? ' · updating…' : ''}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 px-4 text-base"
                disabled={page === 0 || logs.isFetching}
                onClick={() => setPage((value) => Math.max(0, value - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-11 px-4 text-base"
                disabled={page + 1 >= pageCount || logs.isFetching}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

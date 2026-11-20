import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { SelectField } from '@/components/common/select-field'
import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/common/checkbox'
import { useSession } from '@/hooks/useSession'
import { formatDateTime } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { StaffRow, Station } from '@/types/db'

const STAFF_COLUMNS = 'user_id, full_name, role, station, active, created_at, last_active_at'

const stationLabels: Record<Station, string> = {
  entrance: 'Entrance',
  cocktail: 'Cocktail',
  bundle: 'Bundle of Joy',
}

const stationOptions = (Object.keys(stationLabels) as Station[]).map((value) => ({
  value,
  label: stationLabels[value],
}))

export function StaffPage() {
  const queryClient = useQueryClient()
  const { session } = useSession()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const staff = useQuery({
    queryKey: ['admin_staff'],
    queryFn: async (): Promise<StaffRow[]> => {
      const { data, error } = await supabase
        .from('staff')
        .select(STAFF_COLUMNS)
        .order('full_name', { ascending: true })

      if (error) throw error
      return (data ?? []) as StaffRow[]
    },
  })

  async function updateStaff(userId: string, patch: { active?: boolean; station?: Station }) {
    setPendingId(userId)

    try {
      const { data, error } = await supabase
        .from('staff')
        .update(patch)
        .eq('user_id', userId)
        .select('user_id')

      if (error || !data || data.length === 0) {
        toast.error('Could not update this account. Check the network and try again.')
        return
      }

      toast.success('Saved.')
      void queryClient.invalidateQueries({ queryKey: ['admin_staff'] })
      void queryClient.invalidateQueries({ queryKey: ['staff', userId] })
    } catch {
      toast.error('Could not update this account. Check the network and try again.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Staff</h1>
        <Button
          type="button"
          variant="outline"
          className="h-11 px-4 text-base"
          onClick={() => void staff.refetch()}
          disabled={staff.isFetching}
        >
          {staff.isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 text-sm">
        <p className="font-medium">Add a staff account</p>
        <ol className="mt-2 flex list-decimal flex-col gap-1 ps-5 text-muted-foreground">
          <li>Supabase dashboard &gt; Authentication &gt; Users &gt; Add user (auto-confirm).</li>
          <li>Copy the new user UUID.</li>
          <li>
            Run <code className="rounded bg-muted px-1 py-0.5 text-xs">supabase/templates/add_staff.sql</code>{' '}
            with that UUID, name, and station.
          </li>
        </ol>
        <p className="mt-2 text-xs text-muted-foreground">
          Account creation is not available here. Staff never see guests&apos; tokens or backup codes.
        </p>
      </div>

      {staff.isError && !staff.data ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">Could not load staff.</p>
          <Button
            type="button"
            variant="outline"
            className="h-11 px-4 text-base"
            onClick={() => void staff.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : staff.isPending ? (
        <p className="text-sm text-muted-foreground">Loading staff…</p>
      ) : (staff.data ?? []).length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          No staff accounts yet.
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Station</th>
                  <th className="px-3 py-2 font-medium">Active</th>
                  <th className="px-3 py-2 font-medium">Last active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(staff.data ?? []).map((row) => {
                  const isSelf = row.user_id === session?.user.id
                  const busy = pendingId === row.user_id

                  return (
                    <tr key={row.user_id}>
                      <td className="px-3 py-3 font-medium break-words">
                        {row.full_name}
                        {isSelf ? <span className="ms-2 text-xs text-muted-foreground">(you)</span> : null}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge tone={row.role === 'admin' ? 'action' : 'neutral'}>
                          {row.role === 'admin' ? 'Admin' : 'Staff'}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-3">
                        {row.role === 'admin' ? (
                          <span className="text-muted-foreground">Any station</span>
                        ) : (
                          <SelectField
                            ariaLabel={`Station for ${row.full_name}`}
                            value={row.station ?? 'entrance'}
                            onValueChange={(next) =>
                              void updateStaff(row.user_id, { station: next as Station })
                            }
                            options={stationOptions}
                            disabled={busy}
                            compact
                            className="w-40"
                          />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <label className="inline-flex items-center gap-2">
                          <Checkbox
                            checked={row.active}
                            disabled={busy || isSelf || !session}
                            onCheckedChange={(next) => void updateStaff(row.user_id, { active: next })}
                            aria-label={`Active status for ${row.full_name}`}
                          />
                          <span>{row.active ? 'Active' : 'Inactive'}</span>
                        </label>
                        {isSelf ? (
                          <p className="text-xs text-muted-foreground">You cannot deactivate yourself.</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                        {formatDateTime(row.last_active_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col gap-2 md:hidden">
            {(staff.data ?? []).map((row) => {
              const isSelf = row.user_id === session?.user.id
              const busy = pendingId === row.user_id

              return (
                <li key={row.user_id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-base font-medium break-words">
                      {row.full_name}
                      {isSelf ? <span className="ms-2 text-xs text-muted-foreground">(you)</span> : null}
                    </span>
                    <StatusBadge tone={row.role === 'admin' ? 'action' : 'neutral'}>
                      {row.role === 'admin' ? 'Admin' : 'Staff'}
                    </StatusBadge>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Station</dt>
                      <dd>
                        {row.role === 'admin' ? (
                          'Any station'
                        ) : (
                          <SelectField
                            ariaLabel={`Station for ${row.full_name}`}
                            value={row.station ?? 'entrance'}
                            onValueChange={(next) =>
                              void updateStaff(row.user_id, { station: next as Station })
                            }
                            options={stationOptions}
                            disabled={busy}
                            className="mt-1 w-full"
                          />
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Last active</dt>
                      <dd>{formatDateTime(row.last_active_at)}</dd>
                    </div>
                  </dl>

                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={row.active}
                      disabled={busy || isSelf || !session}
                      onCheckedChange={(next) => void updateStaff(row.user_id, { active: next })}
                    />
                    {row.active ? 'Active' : 'Inactive'}
                  </label>
                  {isSelf ? <p className="text-xs text-muted-foreground">You cannot deactivate yourself.</p> : null}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}

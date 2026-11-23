import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { SelectField } from '@/components/common/select-field'
import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { useSession } from '@/hooks/useSession'
import { formatDateTime } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { StaffRow, Station } from '@/types/db'
import { AddStaffDialog } from './AddStaffDialog'
import { ResetPasswordDialog } from './ResetPasswordDialog'
import { setStaffActive, mapError } from './api'

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

function RowActions({
  row,
  isSelf,
  busy,
  onReset,
  onToggle,
}: {
  row: StaffRow
  isSelf: boolean
  busy: boolean
  onReset: () => void
  onToggle: () => void
}) {
  if (row.role === 'admin') return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 px-3 text-sm"
        disabled={busy}
        onClick={onReset}
      >
        Reset password
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          'h-9 px-3 text-sm',
          row.active
            ? 'border-[var(--stop)]/30 text-[var(--stop-text)] hover:bg-[var(--stop-soft)]'
            : 'border-[var(--success)]/30 text-[var(--success-text)] hover:bg-[var(--success-soft)]',
        )}
        disabled={busy || isSelf}
        title={isSelf ? 'You cannot deactivate yourself' : undefined}
        onClick={onToggle}
      >
        {busy ? '…' : row.active ? 'Deactivate' : 'Activate'}
      </Button>
    </div>
  )
}

export function StaffPage() {
  const queryClient = useQueryClient()
  const { session } = useSession()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<StaffRow | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<{ row: StaffRow; next: boolean } | null>(null)

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

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['admin_staff'] })
  }

  async function updateStation(userId: string, station: Station) {
    setPendingId(userId)
    try {
      const { data, error } = await supabase
        .from('staff')
        .update({ station })
        .eq('user_id', userId)
        .select('user_id')

      if (error || data?.length !== 1) {
        toast.error('Could not update station. Try again.')
        return
      }
      toast.success('Station updated.')
      invalidate()
    } catch {
      toast.error('Could not update station. Try again.')
    } finally {
      setPendingId(null)
    }
  }

  async function handleToggleActive() {
    if (!confirmToggle) return
    const { row, next } = confirmToggle
    setConfirmToggle(null)
    setPendingId(row.user_id)
    try {
      const result = await setStaffActive({ user_id: row.user_id, active: next })
      if (!result.ok) {
        toast.error(result.message ?? mapError(result.code))
        return
      }
      toast.success(next ? 'Account activated.' : 'Account deactivated.')
      invalidate()
      void queryClient.invalidateQueries({ queryKey: ['staff', row.user_id] })
    } catch {
      toast.error('Could not update account. Try again.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Staff Management</h1>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 px-4 text-base"
            onClick={() => void staff.refetch()}
            disabled={staff.isFetching}
          >
            {staff.isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button
            type="button"
            className="h-11 gap-2 px-4 text-base"
            onClick={() => setAddOpen(true)}
          >
            <UserPlus className="size-4" aria-hidden />
            Add staff
          </Button>
        </div>
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
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Station</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Last active</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(staff.data ?? []).map((row) => {
                  const isSelf = row.user_id === session?.user.id
                  const busy = pendingId === row.user_id

                  return (
                    <tr key={row.user_id} className={cn(busy && 'opacity-60')}>
                      <td className="px-3 py-3 font-medium">
                        {row.full_name}
                        {isSelf ? (
                          <span className="ms-2 text-xs text-muted-foreground">You</span>
                        ) : null}
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
                            onValueChange={(next) => void updateStation(row.user_id, next as Station)}
                            options={stationOptions}
                            disabled={busy}
                            compact
                            className="w-40"
                          />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge tone={row.active ? 'success' : 'stop'}>
                          {row.active ? 'Active' : 'Inactive'}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                        {formatDateTime(row.last_active_at)}
                      </td>
                      <td className="px-3 py-3">
                        <RowActions
                          row={row}
                          isSelf={isSelf}
                          busy={busy}
                          onReset={() => setResetTarget(row)}
                          onToggle={() => setConfirmToggle({ row, next: !row.active })}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="flex flex-col gap-2 md:hidden">
            {(staff.data ?? []).map((row) => {
              const isSelf = row.user_id === session?.user.id
              const busy = pendingId === row.user_id

              return (
                <li
                  key={row.user_id}
                  className={cn(
                    'flex flex-col gap-3 rounded-xl border border-border bg-card p-4',
                    busy && 'opacity-60',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-base font-medium break-words">
                      {row.full_name}
                      {isSelf ? (
                        <span className="ms-2 text-xs text-muted-foreground">You</span>
                      ) : null}
                    </span>
                    <div className="flex shrink-0 gap-1">
                      <StatusBadge tone={row.role === 'admin' ? 'action' : 'neutral'}>
                        {row.role === 'admin' ? 'Admin' : 'Staff'}
                      </StatusBadge>
                      <StatusBadge tone={row.active ? 'success' : 'stop'}>
                        {row.active ? 'Active' : 'Inactive'}
                      </StatusBadge>
                    </div>
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
                            onValueChange={(next) => void updateStation(row.user_id, next as Station)}
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

                  <RowActions
                    row={row}
                    isSelf={isSelf}
                    busy={busy}
                    onReset={() => setResetTarget(row)}
                    onToggle={() => setConfirmToggle({ row, next: !row.active })}
                  />
                </li>
              )
            })}
          </ul>
        </>
      )}

      {/* Add Staff Dialog */}
      <AddStaffDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={invalidate}
      />

      {/* Reset Password Dialog */}
      <ResetPasswordDialog
        open={!!resetTarget}
        targetId={resetTarget?.user_id ?? ''}
        targetName={resetTarget?.full_name ?? ''}
        onClose={() => setResetTarget(null)}
        onSuccess={invalidate}
      />

      {/* Confirm Deactivate/Activate Dialog */}
      <ConfirmDialog
        open={!!confirmToggle}
        title={confirmToggle?.next ? 'Activate account?' : 'Deactivate account?'}
        description={
          confirmToggle?.next
            ? `${confirmToggle.row.full_name} will be able to log in and scan again.`
            : `${confirmToggle?.row.full_name} will lose scan access and be blocked from logging in.`
        }
        confirmLabel={confirmToggle?.next ? 'Activate' : 'Deactivate'}
        destructive={!confirmToggle?.next}
        onConfirm={handleToggleActive}
        onCancel={() => setConfirmToggle(null)}
      />
    </section>
  )
}

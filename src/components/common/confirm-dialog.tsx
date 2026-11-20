import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive = false,
  requireReason = false,
  checkboxLabel,
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  destructive?: boolean
  requireReason?: boolean
  checkboxLabel?: string
  pending?: boolean
  onConfirm: (reason: string, checked: boolean) => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [reason, setReason] = useState('')
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      setReason('')
      setChecked(false)
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-card p-0 text-card-foreground backdrop:bg-foreground/40"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onConfirm(reason.trim(), checked)
        }}
        className="flex flex-col gap-4 p-5"
      >
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>

        {requireReason ? (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Reason
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              autoFocus
              className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        ) : null}

        {checkboxLabel ? (
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
              className="size-4 rounded border-input accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            {checkboxLabel}
          </label>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-11 px-4 text-base" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={destructive ? 'destructive' : 'default'}
            className="h-11 px-4 text-base"
            disabled={pending || (requireReason && reason.trim() === '')}
          >
            {pending ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  )
}

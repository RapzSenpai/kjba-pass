import { Eye, EyeOff, RefreshCw } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { resetStaffPassword, mapError } from './api'
import { generatePassword } from './generatePassword'
import { StaffCredentialsPanel } from './StaffCredentialsPanel'

const schema = z.object({
  password: z.string().min(10, 'Password must be at least 10 characters.').max(72, 'Too long.'),
})
type FormValues = z.infer<typeof schema>

export function ResetPasswordDialog({
  open,
  targetId,
  targetName,
  onClose,
  onSuccess,
}: {
  open: boolean
  targetId: string
  targetName: string
  onClose: () => void
  onSuccess: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const operationRef = useRef(0)
  const [showPw, setShowPw] = useState(false)
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: generatePassword() },
  })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) {
        operationRef.current += 1
        reset({ password: generatePassword() })
        setCredentials(null)
        setShowPw(false)
        dialog.showModal()
      }
    } else {
      operationRef.current += 1
      if (dialog.open) dialog.close()
    }
  }, [open, reset])

  async function onSubmit(values: FormValues) {
    const operationAtSubmit = operationRef.current
    const result = await resetStaffPassword({ user_id: targetId, password: values.password })

    if (!result.ok) {
      if (operationAtSubmit === operationRef.current) {
        toast.error(result.message ?? mapError(result.code))
      }
      return
    }

    onSuccess()
    if (operationAtSubmit !== operationRef.current) return

    setCredentials({ email: result.email ?? '(no email on file)', password: values.password })
    toast.success('Password reset.')
  }

  function handleCredentialsDone() {
    setCredentials(null)
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        if (!isSubmitting) onClose()
      }}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-card p-0 shadow-xl backdrop:bg-black/40 open:flex open:flex-col"
    >
      <div className="flex flex-col gap-5 p-6">
        <h2 id={titleId} className="text-lg font-semibold">Reset password — {targetName}</h2>

        {credentials ? (
          <StaffCredentialsPanel
            email={credentials.email}
            password={credentials.password}
            onClose={handleCredentialsDone}
          />
        ) : (
          // oxlint-disable-next-line react/refs -- handleSubmit invokes this in an event, not render
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              New password
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    {...register('password')}
                    type={showPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="h-11 w-full rounded-lg border border-input bg-background pe-10 ps-3 font-mono text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <button
                    type="button"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute inset-y-0 end-2 flex items-center rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  aria-label="Generate new password"
                  onClick={() => setValue('password', generatePassword())}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <RefreshCw className="size-4" />
                </button>
              </div>
              {errors.password && (
                <span className="text-xs text-destructive">{errors.password.message}</span>
              )}
            </label>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="submit"
                className="h-11 flex-1 px-4 text-base"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Resetting…' : 'Reset password'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 px-4 text-base"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  )
}

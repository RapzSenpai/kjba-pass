import { Eye, EyeOff, RefreshCw } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/common/select-field'
import { createStaff, mapError } from './api'
import { generatePassword } from './generatePassword'
import { StaffCredentialsPanel } from './StaffCredentialsPanel'
import type { Station } from '@/types/db'

const schema = z.object({
  full_name: z.string().trim().min(2, 'Enter full name (min 2 chars).').max(80, 'Too long.'),
  email: z.string().trim().toLowerCase().email('Enter a valid email.').max(254),
  station: z.enum(['entrance', 'cocktail', 'bundle']),
  password: z.string().min(10, 'Password must be at least 10 characters.').max(72, 'Too long.'),
})
type FormValues = z.infer<typeof schema>

const stationOptions = [
  { value: 'entrance', label: 'Check-in (Entrance)' },
  { value: 'cocktail', label: 'Cocktail' },
  { value: 'bundle', label: 'Bundle of Joy' },
]

export function AddStaffDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const portalContainerRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [showPw, setShowPw] = useState(false)
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { station: 'entrance', password: generatePassword() },
  })

  const station = watch('station')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) {
        reset({ station: 'entrance', password: generatePassword() })
        setCredentials(null)
        setShowPw(false)
        dialog.showModal()
      }
    } else if (dialog.open) {
      dialog.close()
    }
  }, [open, reset])

  async function onSubmit(values: FormValues) {
    const result = await createStaff({
      full_name: values.full_name,
      email: values.email,
      station: values.station as Station,
      password: values.password,
    })

    if (!result.ok) {
      const msg = result.message ?? mapError(result.code)
      toast.error(msg)
      return
    }

    setCredentials({ email: values.email, password: values.password })
    onSuccess()
    toast.success('Staff account created.')
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
      className="relative m-auto w-[calc(100%-2rem)] max-w-sm overflow-visible rounded-xl border border-border bg-card p-0 shadow-xl backdrop:bg-black/40 open:flex open:flex-col"
    >
      <div ref={portalContainerRef} className="absolute inset-0 pointer-events-none overflow-visible" />
      <div className="flex flex-col gap-5 p-6">
        <h2 id={titleId} className="text-lg font-semibold">Add staff account</h2>

        {credentials ? (
          <StaffCredentialsPanel
            email={credentials.email}
            password={credentials.password}
            onClose={handleCredentialsDone}
          />
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Full name
              <input
                {...register('full_name')}
                type="text"
                autoComplete="name"
                className="h-11 rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {errors.full_name && (
                <span className="text-xs text-destructive">{errors.full_name.message}</span>
              )}
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Email
              <input
                {...register('email')}
                type="email"
                autoComplete="email"
                className="h-11 rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {errors.email && (
                <span className="text-xs text-destructive">{errors.email.message}</span>
              )}
            </label>

            <SelectField
              label="Station"
              value={station}
              onValueChange={(v) => setValue('station', v as Station)}
              options={stationOptions}
              container={portalContainerRef}
            />
            {errors.station && (
              <span className="text-xs text-destructive">{errors.station.message}</span>
            )}

            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Password
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
                {isSubmitting ? 'Creating…' : 'Create account'}
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

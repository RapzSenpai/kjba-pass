import { Copy, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function StaffCredentialsPanel({
  email,
  password,
  onClose,
}: {
  email: string
  password: string
  onClose: () => void
}) {
  const [showPw, setShowPw] = useState(false)

  function copyCredentials() {
    const text = `Email: ${email}\nPassword: ${password}`
    navigator.clipboard.writeText(text).then(
      () => toast.success('Credentials copied.'),
      () => toast.error('Copy failed. Note them manually.'),
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--success)]/30 bg-[var(--success-soft)] p-4 text-[var(--success-text)]">
      <p className="text-sm font-semibold">Save these credentials now.</p>

      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs font-medium opacity-75">Email</dt>
          <dd className="break-all font-mono">{email}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs font-medium opacity-75">Password</dt>
          <dd className="flex items-center gap-2">
            <span className="font-mono tracking-wide">
              {showPw ? password : '••••••••••••••'}
            </span>
            <button
              type="button"
              aria-label={showPw ? 'Hide password' : 'Show password'}
              onClick={() => setShowPw((v) => !v)}
              className="rounded p-1 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/40"
            >
              {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </dd>
        </div>
      </dl>

      <p className="text-xs opacity-75 font-medium">⚠ This password is shown only once.</p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 gap-2 px-4 text-sm border-current/30 bg-transparent text-[var(--success-text)] hover:bg-black/5"
          onClick={copyCredentials}
        >
          <Copy className="size-4" aria-hidden />
          Copy credentials
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 px-4 text-sm border-current/30 bg-transparent text-[var(--success-text)] hover:bg-black/5"
          onClick={onClose}
        >
          Done
        </Button>
      </div>
    </div>
  )
}

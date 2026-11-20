import { AlertTriangle, CheckCircle2, X, XCircle } from 'lucide-react'
import { formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { StationResult } from '@/types/db'

const tones = {
  success: {
    card: 'border-[var(--success)] bg-[var(--success-soft)] text-[var(--success-text)]',
    icon: 'text-[var(--success)]',
    Icon: CheckCircle2,
  },
  action: {
    card: 'border-[var(--action)] bg-[var(--action-soft)] text-[var(--action-text)]',
    icon: 'text-[var(--action)]',
    Icon: AlertTriangle,
  },
  stop: {
    card: 'border-[var(--stop)] bg-[var(--stop-soft)] text-[var(--stop-text)]',
    icon: 'text-[var(--stop)]',
    Icon: XCircle,
  },
} as const

export function ResultCard({
  result,
  onDismiss,
  className,
}: {
  result: StationResult | null
  onDismiss?: () => void
  className?: string
}) {
  if (!result) return null

  const tone = result.ok ? 'success' : result.code === 'not_checked_in' ? 'action' : 'stop'
  const { card, icon, Icon } = tones[tone]
  const title = result.guest_name ?? result.message
  const detail = result.guest_name ? result.message : null

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex w-full items-start gap-3 rounded-xl border-2 p-4', card, className)}
    >
      <Icon className={cn('mt-0.5 size-6 shrink-0', icon)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-lg leading-tight font-semibold break-words">{title}</p>
        {detail ? <p className="mt-1 text-sm">{detail}</p> : null}
        {result.at ? <p className="mt-1 text-sm opacity-80">at {formatTime(result.at)}</p> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss result"
          className="-me-1 -mt-1 rounded-md p-1.5 hover:bg-foreground/10"
        >
          <X className="size-5" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}

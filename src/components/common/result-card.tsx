import { AlertTriangle, CheckCircle2, Clock3, X, XCircle } from 'lucide-react'
import { formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { StationResult } from '@/types/db'

const tones = {
  success: {
    card: 'border border-[var(--success)]/25 bg-[var(--success-soft)] text-[var(--success-text)]',
    icon: 'text-[var(--success)]',
    Icon: CheckCircle2,
  },
  action: {
    card: 'border border-[var(--action)]/25 bg-[var(--action-soft)] text-[var(--action-text)]',
    icon: 'text-[var(--action)]',
    Icon: AlertTriangle,
  },
  stop: {
    card: 'border border-[var(--stop)]/25 bg-[var(--stop-soft)] text-[var(--stop-text)]',
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
      className={cn(
        'relative flex w-full items-start gap-3 rounded-xl p-3.5 shadow-xs',
        card,
        className,
      )}
    >
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full bg-current/10',
          icon,
        )}
        aria-hidden
      >
        <Icon className="size-4.5" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-base font-semibold leading-tight break-words">{title}</p>
        {detail ? <p className="mt-1 text-sm leading-normal opacity-90">{detail}</p> : null}
        {result.at ? (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium opacity-75">
            <Clock3 className="size-3.5" aria-hidden />
            {formatTime(result.at)}
          </p>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss result"
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-current/60 transition-colors hover:bg-black/5 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/30"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}

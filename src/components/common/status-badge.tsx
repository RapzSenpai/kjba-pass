import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const tones = {
  success: 'bg-[var(--success-soft)] text-[var(--success-text)]',
  stop: 'bg-[var(--stop-soft)] text-[var(--stop-text)]',
  action: 'bg-[var(--action-soft)] text-[var(--action-text)]',
  neutral: 'bg-muted text-muted-foreground',
} as const

export type StatusTone = keyof typeof tones

export function StatusBadge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: StatusTone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

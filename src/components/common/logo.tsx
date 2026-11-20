import { cn } from '@/lib/utils'

// Swap this one constant when the client logo arrives.
const LOGO_SRC = '/logo.svg'

export function Logo({ className }: { className?: string }) {
  return <img src={LOGO_SRC} alt="KJBA" width={120} height={32} className={cn('h-8 w-auto', className)} />
}

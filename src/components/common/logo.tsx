import logoKjba from '@/assets/logoKjba.png'
import safelinksLogo from '@/assets/safelinksLogo.png'
import { cn } from '@/lib/utils'

export function Logo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap select-none',
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <img
          src={logoKjba}
          alt="KJBA"
          className="h-8 w-auto object-contain [filter:drop-shadow(0_0_6px_rgba(0,0,0,0.16))_drop-shadow(0_1px_2px_rgba(0,0,0,0.12))]"
        />
        <img
          src={safelinksLogo}
          alt="Safelinks"
          className="h-8 w-auto object-contain [filter:drop-shadow(0_0_6px_rgba(0,0,0,0.16))_drop-shadow(0_1px_2px_rgba(0,0,0,0.12))]"
        />
      </div>
      <div className="flex items-baseline gap-1.5 leading-none">
        <span className="text-sm font-bold tracking-tight text-foreground sm:text-base">
          KJBA
        </span>
        <span className="text-xs font-normal text-muted-foreground">
          productions
        </span>
      </div>
    </div>
  )
}


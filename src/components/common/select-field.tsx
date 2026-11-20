import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type SelectFieldOption = {
  value: string
  label: string
}

export function SelectField({
  label,
  id,
  ariaLabel,
  value,
  onValueChange,
  options,
  disabled,
  compact = false,
  className,
  triggerClassName,
}: {
  label?: string
  id?: string
  ariaLabel?: string
  value: string
  onValueChange: (value: string) => void
  options: readonly SelectFieldOption[]
  disabled?: boolean
  compact?: boolean
  className?: string
  triggerClassName?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
      ) : null}
      <Select
        items={options}
        value={value}
        onValueChange={(next) => onValueChange(next as string)}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          aria-label={ariaLabel ?? label}
          className={cn(
            'w-full rounded-lg border-input bg-background px-3 font-normal data-[size=default]:h-11 disabled:cursor-not-allowed disabled:opacity-50 data-disabled:cursor-not-allowed data-disabled:opacity-50',
            compact ? 'text-sm data-[size=default]:h-9' : 'text-base',
            triggerClassName,
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

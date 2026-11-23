import { useId } from 'react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type SelectFieldOption = {
  value: string
  label: string
}

export type SelectFieldGroup = {
  label: string
  options: readonly SelectFieldOption[]
}

export function SelectField({
  label,
  id,
  ariaLabel,
  value,
  onValueChange,
  options,
  groups,
  placeholder,
  error,
  disabled,
  compact = false,
  className,
  triggerClassName,
  container,
  modal = false,
}: {
  label?: string
  id?: string
  ariaLabel?: string
  value: string | null
  onValueChange: (value: string) => void
  options?: readonly SelectFieldOption[]
  groups?: readonly SelectFieldGroup[]
  placeholder?: string
  error?: string
  disabled?: boolean
  compact?: boolean
  className?: string
  triggerClassName?: string
  container?: HTMLElement | ShadowRoot | React.RefObject<HTMLElement | ShadowRoot | null> | null
  modal?: boolean
}) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const errorId = `${fieldId}-error`
  const optionGroups = groups ?? [{ label: '', options: options ?? [] }]
  const items = optionGroups.flatMap((group) => group.options)

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={fieldId} className="text-sm font-medium">
          {label}
        </label>
      ) : null}
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          if (next !== null && next !== undefined) onValueChange(next as string)
        }}
        disabled={disabled}
        modal={modal}
      >
        <SelectTrigger
          id={fieldId}
          aria-label={ariaLabel ?? label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            'w-full rounded-lg border-input bg-background px-3 font-normal data-[size=default]:h-11 disabled:cursor-not-allowed disabled:opacity-50 data-disabled:cursor-not-allowed data-disabled:opacity-50',
            compact ? 'text-sm data-[size=default]:h-9' : 'text-base',
            triggerClassName,
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} container={container}>
          {optionGroups.map((group, index) => (
            <SelectGroup key={group.label || index}>
              {group.label ? <SelectLabel>{group.label}</SelectLabel> : null}
              {group.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <span id={errorId} className="text-sm font-normal text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  )
}

import { Checkbox as UiCheckbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

export interface CheckboxProps {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  'aria-label'?: string
  className?: string
}

export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  'aria-label': ariaLabel,
  className,
}: CheckboxProps) {
  return (
    <UiCheckbox
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn('rounded-[5px]', className)}
    />
  )
}

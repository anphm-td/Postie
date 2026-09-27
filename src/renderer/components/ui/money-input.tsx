import * as React from 'react'
import { cn } from '@renderer/lib/utils'
import { Input } from '@renderer/components/ui/input'

interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> {
  value: string
  onValueChange: (digits: string) => void
}

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function MoneyInput({ value, onValueChange, className, ...props }: MoneyInputProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/[^\d]/g, '').slice(0, 12)
    onValueChange(digits)
  }

  return (
    <Input
      type="text"
      inputMode="numeric"
      value={groupDigits(value)}
      onChange={handleChange}
      className={cn('text-right font-mono tabular-nums', className)}
      {...props}
    />
  )
}

export { groupDigits }

'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: 'sm' | 'md' | 'lg'
  error?: string
}

export default function Select({
  size = 'md',
  error,
  className,
  ...props
}: SelectProps) {
  const sizeClasses = {
    sm: 'h-9 text-sm',
    md: 'h-10',
    lg: 'h-11 text-lg'
  }

  return (
    <div className="w-full">
      <select
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          sizeClasses[size],
          error && 'border-destructive focus-visible:ring-destructive',
          className
        )}
        {...props}
      />
      
      {error && (
        <p className="mt-1 text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}

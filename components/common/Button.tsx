'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  fullWidth?: boolean
  children: React.ReactNode
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const variantClasses = {
    primary: 'bg-primary hover:bg-primary-dark text-white border border-primary',
    secondary: 'bg-secondary hover:bg-secondary-dark text-white border border-secondary',
    ghost: 'hover:bg-muted text-muted-foreground hover:text-foreground',
    destructive: 'bg-error hover:bg-red-700 text-white border border-error',
    outline: 'bg-transparent text-foreground border border-border hover:border-primary hover:text-primary hover:bg-primary-50'
  }

  const sizeClasses = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-9 px-4 py-2 text-sm',
    lg: 'h-10 px-6 text-base'
  }

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
          <span>{children}</span>
        </div>
      ) : (
        children
      )}
    </button>
  )
}

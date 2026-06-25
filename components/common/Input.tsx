'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix' | 'suffix'> {
 size?: 'sm' | 'md' | 'lg'
 error?: string
 prefix?: React.ReactNode
 suffix?: React.ReactNode
}

export default function Input({
 size = 'md',
 error,
 prefix,
 suffix,
 className,
 ...props
}: InputProps) {
 const sizeClasses = {
 sm: 'h-9 text-sm',
 md: 'h-10',
 lg: 'h-11 text-lg'
 }

 return (
 <div className="relative w-full">
 {prefix && (
 <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
 {prefix}
 </div>
 )}
 
 <input
 className={cn(
 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
 sizeClasses[size],
 prefix && 'pl-10',
 suffix && 'pr-10',
 error && 'border-destructive focus-visible:ring-destructive',
 className
 )}
 {...props}
 />
 
 {suffix && (
 <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
 {suffix}
 </div>
 )}
 
 {error && (
 <p className="mt-1 text-sm text-destructive">{error}</p>
 )}
 </div>
 )
}

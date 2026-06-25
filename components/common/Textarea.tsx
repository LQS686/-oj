'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
 size?: 'sm' | 'md' | 'lg'
 error?: string
 rows?: number
}

export default function Textarea({
 size = 'md',
 error,
 rows = 4,
 className,
 ...props
}: TextareaProps) {
 const sizeClasses = {
 sm: 'text-sm',
 md: '',
 lg: 'text-lg'
 }

 return (
 <div className="w-full">
 <textarea
 rows={rows}
 className={cn(
 'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
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

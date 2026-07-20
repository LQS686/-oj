'use client'

import { Loader2 } from 'lucide-react'

export function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'PENDING':
      return <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">PENDING</span>
    case 'PROCESSING':
      return (
        <span className="px-2 py-0.5 rounded text-xs bg-info/10 text-info inline-flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          PROCESSING
        </span>
      )
    case 'COMPLETED':
      return <span className="px-2 py-0.5 rounded text-xs bg-secondary/10 text-secondary">COMPLETED</span>
    case 'FAILED':
      return <span className="px-2 py-0.5 rounded text-xs bg-error/10 text-error">FAILED</span>
    default:
      return <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">{status}</span>
  }
}

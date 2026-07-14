'use client'

export function PageLoading({ label = '加载中...' }: { label?: string }) {
  return (
    <div className="min-h-[30vh] flex items-center justify-center">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-icon-spin" />
        <span>{label}</span>
      </div>
    </div>
  )
}
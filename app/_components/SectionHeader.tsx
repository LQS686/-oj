'use client'

import type { ComponentType } from 'react'

export function SectionHeader({
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  title,
  subtitle,
}: {
  eyebrow: string
  eyebrowIcon: ComponentType<{ className?: string }>
  title: string
  subtitle: string
}) {
  return (
    <div className="text-center mb-8 md:mb-10">
      <div className="inline-flex items-center gap-2 text-primary text-xs md:text-sm font-semibold mb-3 uppercase tracking-wider">
        <EyebrowIcon className="w-3.5 h-3.5" />
        <span>{eyebrow}</span>
      </div>
      <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground mb-3 tracking-tight">
        {title}
      </h2>
      <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
        {subtitle}
      </p>
    </div>
  )
}

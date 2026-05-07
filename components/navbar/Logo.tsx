import React from 'react'
import Link from 'next/link'
import { Code2 } from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'

export default function Logo() {
  const { settings } = useSettings()

  return (
    <Link href="/" className="flex items-center gap-3 group">
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary to-secondary blur-lg opacity-40 group-hover:opacity-60 transition-opacity duration-300 rounded-xl animate-pulse-slow"></div>
        <div className="relative w-10 h-10 bg-gradient-to-br from-primary to-primary-dark rounded-xl flex items-center justify-center shadow-lg shadow-primary/30 group-hover:scale-110 transition-transform duration-300">
          <Code2 className="w-5 h-5 text-white" />
        </div>
      </div>
      <div className="hidden sm:flex flex-col">
        <span className="text-lg font-bold text-foreground tracking-tight group-hover:text-primary-light transition-colors duration-300">
          {settings.siteName}
        </span>
        <span className="text-[10px] text-muted-foreground -mt-0.5 group-hover:text-primary/70 transition-colors duration-300">
          {settings.siteDescription}
        </span>
      </div>
    </Link>
  )
}

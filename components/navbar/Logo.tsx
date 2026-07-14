import Link from 'next/link'
import { Code2 } from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'

export default function Logo() {
  const { settings } = useSettings()

  return (
    <Link href="/" className="flex items-center gap-2.5 group">
      <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center transition-all duration-300 group-hover:shadow-lg group-hover:shadow-primary/25 group-hover:scale-110 group-hover:rotate-3">
        <Code2 className="w-4 h-4 text-white" />
      </div>
      <div className="hidden sm:flex flex-col">
        <span className="text-sm font-bold text-foreground tracking-tight group-hover:text-primary transition-colors duration-200">
          {settings.siteName}
        </span>
        <span className="text-[10px] text-muted-foreground -mt-0.5">
          {settings.siteDescription}
        </span>
      </div>
    </Link>
  )
}

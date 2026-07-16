import Link from 'next/link'
import Image from 'next/image'
import { useSettings } from '@/contexts/SettingsContext'

export default function Logo() {
  const { settings } = useSettings()

  return (
    <Link href="/" className="flex items-center gap-2.5 group">
      <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-white/80 backdrop-blur-sm">
        <Image
          src="/logos/dsojlogo.png"
          alt="Dashan OJ Logo"
          width={32}
          height={32}
          className="w-full h-full object-contain transition-transform duration-200 group-hover:scale-105"
          priority
        />
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

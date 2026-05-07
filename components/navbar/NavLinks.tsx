import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  BookOpen, 
  Trophy, 
  Dumbbell, 
  Users, 
  MessageSquare,
  BarChart3
} from 'lucide-react'

interface NavLink {
  href: string
  label: string
  icon: React.ElementType
}

export default function NavLinks() {
  const pathname = usePathname()

  const navLinks: NavLink[] = [
    { href: '/problems', label: '题库', icon: BookOpen },
    { href: '/contests', label: '竞赛', icon: Trophy },
    { href: '/training', label: '训练', icon: Dumbbell },
    { href: '/teams', label: '团队', icon: Users },
    { href: '/discuss', label: '社区', icon: MessageSquare },
    { href: '/rank', label: '排行榜', icon: BarChart3 },
  ]

  return (
    <div className="hidden lg:flex items-center gap-1">
      {navLinks.map((link) => {
        const Icon = link.icon
        const isActive = pathname === link.href
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`nav-link ${isActive ? 'active' : ''}`}
            onMouseEnter={(e) => {
              e.currentTarget.classList.add('scale-105')
            }}
            onMouseLeave={(e) => {
              e.currentTarget.classList.remove('scale-105')
            }}
          >
            <Icon className="w-[18px] h-[18px] transition-transform duration-300 group-hover:rotate-3" />
            <span>{link.label}</span>
          </Link>
        )
      })}
    </div>
  )
}

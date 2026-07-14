import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  Trophy,
  Dumbbell,
  GraduationCap,
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
    { href: '/classes', label: '班级', icon: GraduationCap },
    { href: '/rank', label: '排行榜', icon: BarChart3 },
  ]

  return (
    <div className="hidden lg:flex items-center gap-0.5">
      {navLinks.map((link) => {
        const Icon = link.icon
        const isActive = pathname === link.href
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`nav-link ${isActive ? 'active' : ''}`}
          >
            <Icon className={`w-4 h-4 transition-transform duration-200 ${isActive ? '' : 'group-hover:scale-110'}`} />
            <span>{link.label}</span>
          </Link>
        )
      })}
    </div>
  )
}

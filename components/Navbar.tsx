'use client'

import { useEffect, useState, memo } from 'react'
import { usePathname } from 'next/navigation'
import Logo from './navbar/Logo'
import NavLinks from './navbar/NavLinks'
import SearchBar from './navbar/Search'
import UserMenu from './navbar/UserMenu'
import MobileMenu from './navbar/MobileMenu'

const Navbar = () => {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 8)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const isAdminRoute = pathname?.startsWith('/admin')

  if (isAdminRoute) {
    return null
  }

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-[100] border-b transition-all duration-300 ${
        scrolled
          ? 'border-border/60 bg-background-secondary/80 backdrop-blur-xl shadow-sm'
          : 'border-border bg-background-secondary'
      }`}
      style={{ zIndex: 'var(--z-navbar)' }}
    >
      <div className="w-full max-w-page-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <Logo />

          <NavLinks />

          <div className="flex items-center gap-2">
            <SearchBar />
            <UserMenu />
            <MobileMenu />
          </div>
        </div>
      </div>
    </nav>
  )
}

export default memo(Navbar)

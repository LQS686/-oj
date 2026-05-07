'use client'

import React, { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Logo from './navbar/Logo'
import NavLinks from './navbar/NavLinks'
import SearchBar from './navbar/Search'
import UserMenu from './navbar/UserMenu'
import MobileMenu from './navbar/MobileMenu'

const Navbar = () => {
  const pathname = usePathname()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [pathname])

  const isAdminRoute = pathname?.startsWith('/admin')
  
  if (isAdminRoute) {
    return null
  }

  return (
    <nav className="glass-strong fixed top-4 left-4 right-4 z-[100] rounded-2xl transition-all duration-300 hover:shadow-lg hover:shadow-primary/20">
      <div className="container mx-auto px-5">
        <div className="flex items-center justify-between h-16">
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

export default React.memo(Navbar)

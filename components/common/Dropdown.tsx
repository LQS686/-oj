'use client'

import React, { useState, useRef, useCallback, ReactNode } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'

interface DropdownProps {
  trigger: ReactNode
  children: ReactNode
  className?: string
  align?: 'left' | 'right'
}

export default function Dropdown({ 
  trigger, 
  children, 
  className = '',
  align = 'right'
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const isTogglingRef = useRef(false)

  useClickOutside(dropdownRef, () => {
    if (isOpen) setIsOpen(false)
  })

  const toggleDropdown = useCallback(() => {
    if (isTogglingRef.current) return
    isTogglingRef.current = true
    setIsOpen(prev => !prev)
    setTimeout(() => {
      isTogglingRef.current = false
    }, 300)
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleDropdown()
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }, [toggleDropdown])

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        onClick={toggleDropdown}
        onKeyDown={handleKeyDown}
        role="button"
        aria-expanded={isOpen}
        aria-haspopup="true"
        tabIndex={0}
      >
        {trigger}
      </div>
      
      {isOpen && (
        <div 
          className={`dropdown-menu animate-dropdownIn ${className} ${align === 'right' ? 'right-0' : 'left-0'}`}
          role="menu"
        >
          {children}
        </div>
      )}
    </div>
  )
}

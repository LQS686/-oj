'use client'

import { useState, useRef, useCallback, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useClickOutside } from '@/hooks/useClickOutside'

interface DropdownProps {
 trigger: ReactNode
 children: ReactNode
 className?: string
 align?: 'left' | 'right'
}

const dropdownVariants = {
  hidden: { opacity: 0, scale: 0.95, y: -4 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.15, ease: [0.16, 1, 0.3, 1] as const },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -4,
    transition: { duration: 0.1, ease: 'easeIn' as const },
  },
}

export default function Dropdown({ 
 trigger, 
 children, 
 className = '',
 align = 'right'
}: DropdownProps) {
 const [isOpen, setIsOpen] = useState(false)
 const dropdownRef = useRef<HTMLDivElement>(null)

 useClickOutside(dropdownRef, () => {
   if (isOpen) setIsOpen(false)
 })

 const toggleDropdown = useCallback(() => {
   setIsOpen(prev => !prev)
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
     
     <AnimatePresence>
       {isOpen && (
         <motion.div
           className={`dropdown-menu ${className} ${align === 'right' ? 'right-0' : 'left-0'}`}
           variants={dropdownVariants}
           initial="hidden"
           animate="visible"
           exit="exit"
           role="menu"
         >
           {children}
         </motion.div>
       )}
     </AnimatePresence>
   </div>
 )
}

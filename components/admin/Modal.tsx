'use client'

import { ReactNode, useState, useEffect } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
 isOpen: boolean
 onClose: () => void
 title?: string
 children: ReactNode
 size?: 'sm' | 'md' | 'lg' | 'xl'
 showCloseButton?: boolean
 closeOnOverlayClick?: boolean
}

export default function Modal({
 isOpen,
 onClose,
 title,
 children,
 size = 'md',
 showCloseButton = true,
 closeOnOverlayClick = true
}: ModalProps) {
 const [isMounted, setIsMounted] = useState(false)

 useEffect(() => {
 if (isOpen) {
 setIsMounted(true)
 document.body.style.overflow = 'hidden'
 }

 return () => {
 document.body.style.overflow = 'unset'
 }
 }, [isOpen])

 if (!isOpen && !isMounted) {
 return null
 }

 const sizeClasses = {
 sm: 'max-w-sm',
 md: 'max-w-md',
 lg: 'max-w-lg',
 xl: 'max-w-xl'
 }

 return (
 <div 
 className={`fixed inset-0 flex items-center justify-center z-50 transition-opacity duration-300 ${
 isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
 }`}
 style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(8px)' }}
 >
 <div 
 className={`card w-full mx-4 ${sizeClasses[size]} transition-all duration-300 transform ${
 isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
 }`}
 >
 {title && (
 <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
 <h3 className="text-lg font-bold text-white">{title}</h3>
 {showCloseButton && (
 <button
 onClick={onClose}
 className="p-2 hover:bg-white/10 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
 aria-label="关闭"
 >
 <X className="w-5 h-5 text-slate-400" />
 </button>
 )}
 </div>
 )}
 <div className="px-6 py-4">
 {children}
 </div>
 </div>
 {closeOnOverlayClick && (
 <div 
 className="absolute inset-0 -z-10" 
 onClick={onClose}
 />
 )}
 </div>
 )
}

'use client'

import { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'

interface ConfirmDialogProps {
 isOpen: boolean
 onClose: () => void
 onConfirm: () => void
 title: string
 message: string
 confirmText?: string
 cancelText?: string
 danger?: boolean
 children?: ReactNode
}

export default function ConfirmDialog({
 isOpen,
 onClose,
 onConfirm,
 title,
 message,
 confirmText = '确认',
 cancelText = '取消',
 danger = false,
 children
}: ConfirmDialogProps) {
 if (!isOpen) {
 return null
 }

 return (
 <div 
 className="fixed inset-0 flex items-center justify-center z-50 animate-fade-in"
 style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(8px)' }}
 >
 <div className="card w-full max-w-md mx-4">
 <div className="px-6 py-4 border-b border-white/10">
 <h3 className="text-lg font-bold text-white flex items-center gap-2">
 <AlertCircle className="w-5 h-5 text-amber-400" />
 {title}
 </h3>
 </div>
 <div className="px-6 py-4">
 <p className="text-slate-400 mb-4">{message}</p>
 {children}
 </div>
 <div className="px-6 py-4 border-t border-white/10 flex gap-3 justify-end">
 <button
 onClick={onClose}
 className="btn btn-ghost"
 >
 {cancelText}
 </button>
 <button
 onClick={onConfirm}
 className={danger ? 'btn btn-destructive' : 'btn btn-primary'}
 >
 {confirmText}
 </button>
 </div>
 </div>
 </div>
 )
}

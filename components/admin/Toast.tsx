'use client'

import { useEffect } from 'react'
import { CheckCircle, AlertCircle, Info } from 'lucide-react'

interface ToastProps {
 message: string
 type: 'success' | 'error' | 'info'
 duration?: number
 onClose: () => void
}

export default function Toast({
 message,
 type,
 duration = 3000,
 onClose
}: ToastProps) {
 useEffect(() => {
 const timer = setTimeout(onClose, duration)
 return () => clearTimeout(timer)
 }, [duration, onClose])

 const typeConfig = {
 success: {
 icon: CheckCircle,
 className: 'bg-green-500/20 text-green-400 border border-green-500/30'
 },
 error: {
 icon: AlertCircle,
 className: 'bg-red-500/20 text-red-400 border border-red-500/30'
 },
 info: {
 icon: Info,
 className: 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
 }
 }

 const Config = typeConfig[type]
 const Icon = Config.icon

 return (
 <div 
 className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-slide-in-right ${Config.className}`}
 style={{ backdropFilter: 'blur(12px)' }}
 >
 <Icon className="w-5 h-5" />
 <span className="text-sm font-medium">{message}</span>
 <button
 onClick={onClose}
 className="ml-2 text-slate-400 hover:text-white transition-colors"
 aria-label="关闭"
 >
 ×
 </button>
 </div>
 )
}

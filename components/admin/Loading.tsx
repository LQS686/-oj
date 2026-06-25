'use client'

import { ReactNode } from 'react'

interface LoadingProps {
 size?: 'sm' | 'md' | 'lg'
 text?: string
 fullScreen?: boolean
 children?: ReactNode
}

export default function Loading({
 size = 'md',
 text = '加载中...',
 fullScreen = false,
 children
}: LoadingProps) {
 const sizeClasses = {
 sm: 'w-8 h-8',
 md: 'w-12 h-12',
 lg: 'w-16 h-16'
 }

 const loadingComponent = (
 <div className={`flex flex-col items-center justify-center gap-4 ${
 fullScreen ? 'fixed inset-0 z-50' : ''
 }`}
 style={fullScreen ? { background: 'rgba(2, 6, 23, 0.9)', backdropFilter: 'blur(8px)' } : {}}
 >
 <div className={`${sizeClasses[size]} border-4 border-primary/30 border-t-primary rounded-full animate-spin`}></div>
 {text && <p className="text-slate-400">{text}</p>}
 </div>
 )

 if (fullScreen) {
 return loadingComponent
 }

 return children ? (
 <div className="relative">
 {children}
 <div className="absolute inset-0 flex items-center justify-center"
 style={{ background: 'rgba(2, 6, 23, 0.9)', backdropFilter: 'blur(8px)' }}>
 {loadingComponent}
 </div>
 </div>
 ) : (
 loadingComponent
 )
}

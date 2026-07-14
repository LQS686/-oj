'use client'

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';

interface LayoutContentProps {
 children: React.ReactNode;
}

export default function LayoutContent({ children }: LayoutContentProps) {
 const pathname = usePathname();
 const isHomePage = pathname === '/';

 return (
 <div>
 <main className={`min-h-[calc(100vh-56px)] ${isHomePage ? '' : ''}`}>
 <Suspense fallback={null}>
 <div
 key={pathname}
 className="animate-fade-in"
 >
 {children}
 </div>
 </Suspense>
 </main>
 </div>
 );
}

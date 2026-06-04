'use client'

import React, { Suspense } from 'react';
import { usePathname } from 'next/navigation';

interface LayoutContentProps {
  children: React.ReactNode;
}

export default function LayoutContent({ children }: LayoutContentProps) {
  const pathname = usePathname();
  const isHomePage = pathname === '/';

  return (
    <div>
      <main className={`min-h-[calc(100vh-112px)] ${isHomePage ? '' : 'p-4 sm:p-6 md:p-8'}`}>
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

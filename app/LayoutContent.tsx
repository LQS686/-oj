'use client'

import React, { Suspense, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Breadcrumb from "@/components/Breadcrumb";

interface LayoutContentProps {
  children: React.ReactNode;
}

export default function LayoutContent({ children }: LayoutContentProps) {
  const pathname = usePathname();
  const isHomePage = pathname === '/';
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentChildren, setCurrentChildren] = useState<React.ReactNode>(children);

  useEffect(() => {
    setIsTransitioning(true);
    
    const timer = setTimeout(() => {
      setCurrentChildren(children);
      const transitionTimer = setTimeout(() => {
        setIsTransitioning(false);
      }, 300);
      
      return () => clearTimeout(transitionTimer);
    }, 200);
    
    return () => clearTimeout(timer);
  }, [pathname, children]);

  return (
    <div>
      <main className={`min-h-[calc(100vh-112px)] ${isHomePage ? '' : 'p-4 sm:p-6 md:p-8'}`}>
        <Suspense fallback={null}>
          <div 
            className={`transition-all duration-300 ease-in-out ${isTransitioning ? 'opacity-0 transform translate-y-4' : 'opacity-100 transform translate-y-0'}`}
          >
            {currentChildren}
          </div>
        </Suspense>
      </main>
    </div>
  );
}

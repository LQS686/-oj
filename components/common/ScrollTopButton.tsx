'use client'

import { ArrowUp } from 'lucide-react'

/** 回到顶部按钮（client）：题面页右下角悬浮按钮。 */
export default function ScrollTopButton() {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <button
      type="button"
      onClick={scrollToTop}
      className="fixed bottom-20 right-6 lg:bottom-6 w-12 h-12 rounded-full bg-primary/80 hover:bg-primary transition-colors duration-300 flex items-center justify-center shadow-lg z-50"
      aria-label="回到顶部"
    >
      <ArrowUp className="w-5 h-5 text-white" />
    </button>
  )
}

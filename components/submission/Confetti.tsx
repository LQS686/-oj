'use client'

import { useEffect, useRef } from 'react'

interface ConfettiProps {
  /** 触发彩纸动画的唯一键，变化时重新触发 */
  trigger: number | string
  /** 持续时长（毫秒），默认 3000 */
  duration?: number
  /** 粒子数量，默认 120 */
  count?: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  rotation: number
  rotationSpeed: number
  shape: 'rect' | 'circle'
  life: number
}

const COLORS = [
  '#10b981', '#22c55e', '#3b82f6', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4',
  '#f97316', '#84cc16',
]

/**
 * 轻量彩纸动画组件，纯 Canvas 实现，无第三方依赖。
 * 在 trigger 变化时触发一次动画，duration 后自动停止。
 */
export default function Confetti({ trigger, duration = 3000, count = 120 }: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const w = window.innerWidth
    const h = window.innerHeight
    const particles: Particle[] = []
    for (let i = 0; i < count; i++) {
      const fromLeft = i % 2 === 0
      const originX = fromLeft ? w * 0.25 : w * 0.75
      const originY = h * 0.4
      particles.push({
        x: originX + (Math.random() - 0.5) * 80,
        y: originY + (Math.random() - 0.5) * 40,
        vx: (fromLeft ? 1 : -1) * (3 + Math.random() * 6) + (Math.random() - 0.5) * 2,
        vy: -(8 + Math.random() * 8),
        size: 6 + Math.random() * 8,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.3,
        shape: Math.random() > 0.5 ? 'rect' : 'circle',
        life: 1,
      })
    }
    particlesRef.current = particles
    startTimeRef.current = performance.now()

    const gravity = 0.35
    const airResistance = 0.99

    const tick = (now: number) => {
      const elapsed = now - startTimeRef.current
      const w = window.innerWidth
      const h = window.innerHeight
      ctx.clearRect(0, 0, w, h)

      const fadeStart = duration * 0.6
      const lifeFactor = elapsed < fadeStart ? 1 : Math.max(0, 1 - (elapsed - fadeStart) / (duration - fadeStart))

      particlesRef.current.forEach((p) => {
        p.vy += gravity
        p.vx *= airResistance
        p.x += p.vx
        p.y += p.vy
        p.rotation += p.rotationSpeed
        p.life = lifeFactor

        if (p.y > h + 40) return

        ctx.save()
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.fillStyle = p.color
        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        } else {
          ctx.beginPath()
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      })

      if (elapsed < duration) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        ctx.clearRect(0, 0, w, h)
        rafRef.current = null
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    window.addEventListener('resize', resize)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      window.removeEventListener('resize', resize)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[60] pointer-events-none"
      aria-hidden="true"
    />
  )
}

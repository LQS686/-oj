'use client'

import { useState, useRef, useCallback, useEffect, useId, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useClickOutside } from '@/hooks/useClickOutside'
import { getFocusableElements } from '@/hooks/useFocusTrap'

/**
 * 下拉浮层 —— 全站下拉的唯一实现，覆盖两种语义：
 *
 *   role="menu"（默认）  命令菜单（如用户菜单），遵循 WAI-ARIA menu button 模式
 *   role="dialog"        内容浮层（如通知列表），非模态对话框、保留自然 Tab 顺序
 *
 * 共同行为：
 *   - 触发器由调用方渲染（render-prop），aria-haspopup / aria-expanded / aria-controls
 *     直接落在真实 <button> 上；点击与按键绑在本组件包裹元素上、按事件目标分派，
 *     因此不会出现「外层 div + 内层 button」两个 Tab 停靠点；
 *   - 打开时把焦点移入浮层，键盘用户不必再 Tab 一次；
 *   - Esc 关闭并把焦点还给触发器；点击浮层外关闭；
 *   - 菜单模式：点击浮层内任意可点项后关闭；
 *     对话框式浮层：因常含输入框等控件，只对跳转链接（a[href]）或
 *     显式标记 data-dropdown-close 的元素关闭，点输入框不会误关。
 *
 * role="menu" 额外提供：
 *   ↓ 打开并聚焦首项、↑ 打开并聚焦末项；浮层内 ↑/↓ 循环移动、Home/End 到首尾、
 *   Tab 关闭菜单；并自动给浮层内可点项补 role="menuitem" 与 roving tabindex（-1），
 *   调用处无需手写这些语义与键盘逻辑。
 */

interface DropdownProps {
  /**
   * 触发器渲染函数：调用方自己持有 <button> 并把 props 展开上去，
   * 例如 trigger={(p) => <button {...p}>菜单</button>}。
   */
  trigger: (props: DropdownTriggerProps) => ReactNode
  /** 浮层内容 */
  children: ReactNode
  className?: string
  align?: 'left' | 'right'
  /** 浮层语义：命令菜单用 menu（默认），内容浮层用 dialog */
  role?: 'menu' | 'dialog'
  /** 浮层的无障碍名称 */
  label?: string
  /** 受控开合：传了 open 则由外部完全控制（例如 ⌘K 快捷键也要能打开同一个浮层） */
  open?: boolean
  /** 展开状态变化回调（非受控时用于通知；受控时用于接收变更请求） */
  onOpenChange?: (open: boolean) => void
}

export type DropdownTriggerProps = {
  'aria-haspopup': 'menu' | 'dialog'
  'aria-expanded': boolean
  'aria-controls': string | undefined
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
  align = 'right',
  role = 'menu',
  label,
  open,
  onOpenChange,
}: DropdownProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  // 受控 / 非受控双模式
  const isOpen = open ?? internalOpen
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const pendingFocusRef = useRef<'first' | 'last' | null>(null)
  const menuId = useId()

  const setOpen = useCallback(
    (next: boolean) => {
      if (open === undefined) setInternalOpen(next)
      onOpenChange?.(next)
    },
    [open, onOpenChange]
  )

  const openMenu = useCallback(
    (mode: 'first' | 'last' | null) => {
      pendingFocusRef.current = mode
      setOpen(true)
    },
    [setOpen]
  )

  const closeMenu = useCallback(() => {
    setOpen(false)
  }, [setOpen])

  useClickOutside(dropdownRef, () => {
    // 点击外部关闭：属鼠标操作，不把焦点抢回触发器
    if (isOpen) closeMenu()
  })

  const getItems = useCallback(
    () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>(
          '[role="menuitem"], .dropdown-item, a[href], button'
        ) ?? []
      ),
    []
  )

  const focusItem = useCallback(
    (index: number) => {
      const items = getItems()
      if (items.length === 0) return
      items[(index + items.length) % items.length]?.focus()
    },
    [getItems]
  )

  const focusTrigger = useCallback(() => {
    dropdownRef.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus()
  }, [])

  // 打开后：菜单模式补齐菜单项语义（roving tabindex），并把焦点移到浮层内
  useEffect(() => {
    if (!isOpen) return
    const items = getItems()
    if (role === 'menu') {
      items.forEach((el) => {
        if (!el.hasAttribute('role')) el.setAttribute('role', 'menuitem')
        el.tabIndex = -1
      })
    }
    // 菜单由点击展开时不抢焦点；对话框式浮层则总是移入，便于键盘接着操作
    // 对话框式浮层里首个可聚焦元素可能是输入框（如搜索浮层），
    // 所以落点用「真正可聚焦元素」而不是菜单项来选
    const targets =
      role === 'dialog' && menuRef.current ? getFocusableElements(menuRef.current) : items
    const mode = pendingFocusRef.current ?? (role === 'dialog' ? 'first' : null)
    pendingFocusRef.current = null
    if (mode === 'first') targets[0]?.focus()
    else if (mode === 'last') targets[targets.length - 1]?.focus()
  }, [isOpen, role, getItems])

  const handleWrapperClick = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('[aria-haspopup]')) {
        if (isOpen) closeMenu()
        else openMenu(null)
        return
      }
      // 浮层内的点击交给元素自身的 handler，这里只决定「是否顺带关闭浮层」。
      // 菜单：点任意可点项即关闭。
      // 对话框式浮层内含输入框等控件，只有跳转链接或显式标记的元素才关闭，
      // 否则点一下搜索框浮层就没了。
      if (role === 'menu') {
        if (target.closest('[role="menu"]')) closeMenu()
        return
      }
      if (target.closest('[data-dropdown-close], a[href]')) closeMenu()
    },
    [role, isOpen, openMenu, closeMenu]
  )

  // 触发器与浮层的按键统一在包裹元素上按事件目标分派。
  // Enter/Space 交给 <button> 的原生 click，不在此重复处理。
  const handleWrapperKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const target = event.target as HTMLElement
      const isMenu = role === 'menu'

      if (target.closest('[aria-haspopup]')) {
        if (isMenu && event.key === 'ArrowDown') {
          event.preventDefault()
          if (isOpen) focusItem(0)
          else openMenu('first')
        } else if (isMenu && event.key === 'ArrowUp') {
          event.preventDefault()
          if (isOpen) focusItem(getItems().length - 1)
          else openMenu('last')
        } else if (event.key === 'Escape' && isOpen) {
          closeMenu()
        }
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu()
        focusTrigger()
        return
      }
      // 对话框式浮层不劫持 Tab / 方向键：内容里通常有输入框等控件，
      // 需要保留自然的 Tab 顺序与光标移动。
      if (!isMenu) return
      if (event.key === 'Tab') {
        closeMenu()
        return
      }

      const items = getItems()
      const current = items.indexOf(document.activeElement as HTMLElement)
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          focusItem(current + 1)
          break
        case 'ArrowUp':
          event.preventDefault()
          focusItem(current - 1)
          break
        case 'Home':
          event.preventDefault()
          focusItem(0)
          break
        case 'End':
          event.preventDefault()
          focusItem(items.length - 1)
          break
        default:
          break
      }
    },
    [role, isOpen, focusItem, getItems, openMenu, closeMenu, focusTrigger]
  )

  const triggerProps: DropdownTriggerProps = {
    'aria-haspopup': role,
    'aria-expanded': isOpen,
    'aria-controls': isOpen ? menuId : undefined,
  }

  return (
    <div
      className="relative"
      ref={dropdownRef}
      onClick={handleWrapperClick}
      onKeyDown={handleWrapperKeyDown}
    >
      {trigger(triggerProps)}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            id={menuId}
            ref={menuRef}
            className={`dropdown-menu ${className} ${align === 'right' ? 'right-0' : 'left-0'}`}
            variants={dropdownVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            role={role}
            aria-label={label}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

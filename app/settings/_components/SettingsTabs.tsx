'use client'

import { motion } from 'motion/react'
import { SETTINGS_TABS, type SettingsTabId } from '../_utils'

interface SettingsTabsProps {
  activeTab: SettingsTabId
  onTabChange: (tab: SettingsTabId) => void
}

/** 设置页导航：桌面侧栏（无独立卡片）/ 移动端横向 Tab */
export function SettingsTabs({ activeTab, onTabChange }: SettingsTabsProps) {
  return (
    <>
      <div className="lg:hidden flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 mb-1">
        {SETTINGS_TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary/15 text-primary-light'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      <nav className="hidden lg:block pr-1">
        <ul className="space-y-0.5">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <li key={tab.id}>
                <button
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={`relative w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    isActive
                      ? 'text-primary-light'
                      : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="settings-tab-indicator"
                      className="absolute inset-0 bg-primary/10 rounded-lg"
                      transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                    />
                  )}
                  <Icon className="relative z-10 w-4 h-4 shrink-0" />
                  <span className="relative z-10 text-sm font-medium">{tab.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}

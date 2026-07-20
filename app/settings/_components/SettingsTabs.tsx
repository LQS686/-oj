'use client'

import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { SETTINGS_TABS, type SettingsTabId } from '../_utils'

interface SettingsTabsProps {
  activeTab: SettingsTabId
  onTabChange: (tab: SettingsTabId) => void
}

/** 设置页左侧 Tab 导航 */
export function SettingsTabs({ activeTab, onTabChange }: SettingsTabsProps) {
  return (
    <div className="lg:col-span-1">
      <div className="card-static p-3">
        <nav className="space-y-1">
          {SETTINGS_TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all group ${
                  isActive
                    ? 'text-primary-light'
                    : 'text-muted-foreground hover:bg-primary/8 hover:text-foreground'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="settings-tab-indicator"
                    className="absolute inset-0 bg-primary/15 border border-primary/25 rounded-lg"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-3">
                  <Icon
                    className={`w-5 h-5 ${isActive ? 'text-primary-light' : 'group-hover:text-primary-light'}`}
                  />
                  <div className="text-left flex-1">
                    <div className="font-medium text-sm">{tab.label}</div>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity ${
                      isActive ? 'opacity-100' : ''
                    }`}
                  />
                </span>
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

import { Settings } from 'lucide-react'

/** 设置页顶部标题区 */
export function SettingsHeader() {
  return (
    <div className="flex items-center gap-4 mb-8">
      <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg">
        <Settings className="w-6 h-6 text-white" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-foreground">设置</h1>
        <p className="text-muted-foreground text-sm mt-0.5">管理您的账户设置和偏好</p>
      </div>
    </div>
  )
}

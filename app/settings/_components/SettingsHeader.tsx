/** 设置页顶部标题：轻量，避免与下方主卡片抢视觉 */
export function SettingsHeader() {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-bold text-foreground tracking-tight">个人设置</h1>
      <p className="text-muted-foreground text-sm mt-0.5">管理资料、账号安全与做题偏好</p>
    </div>
  )
}

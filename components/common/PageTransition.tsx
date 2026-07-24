/**
 * 根布局内容透传。
 * 路由切换反馈由 NavigationProgress 顶栏进度条承担，避免旧页冻结与双重淡入。
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

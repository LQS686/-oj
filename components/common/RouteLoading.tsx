export default function RouteLoading() {
  return (
    <div className="min-h-[calc(100vh-var(--navbar-height))] flex items-center justify-center">
      <div
        className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin"
        aria-label="页面加载中"
      />
    </div>
  )
}

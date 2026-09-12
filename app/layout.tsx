import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'
import { UserProvider } from '@/contexts/UserContext'
import { SettingsProvider } from '@/contexts/SettingsContext'
import { SwrProvider } from '@/components/SwrProvider'
import { Toaster } from 'react-hot-toast'
import DocumentTitleProvider from '@/components/DocumentTitleProvider'
import { SITE_TITLE_SUFFIX } from '@/lib/document-title'
import PageTransition from '@/components/common/PageTransition'
import MainLandmark from '@/components/layout/MainLandmark'
import NavigationProgress from '@/components/common/NavigationProgress'
import { DialogProvider } from '@/components/common/DialogProvider'
import { getServerSessionUser } from '@/lib/auth/server-session'
import { getPublicSettings } from '@/lib/settings'

const siteBaseUrl =
  process.env.NEXT_PUBLIC_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(siteBaseUrl),
  title: `首页 - ${SITE_TITLE_SUFFIX}`,
  description:
    '代码如山·算法为径。大山 OJ 是一站式在线编程学习与竞赛平台，从入门到顶峰的清晰成长路径。',
  keywords: ['大山 OJ', 'OJ', '编程', '算法', '竞赛', '题库', '在线评测', '学习平台', '训练'],
  authors: [{ name: 'Dashan OJ Team' }],
  icons: {
    icon: [{ url: '/logos/dsojlogo.png', type: 'image/png' }],
    shortcut: '/logos/dsojlogo.png',
    apple: '/logos/dsojlogo.png',
  },
  openGraph: {
    title: `首页 - ${SITE_TITLE_SUFFIX}`,
    description:
      '代码如山·算法为径。大山 OJ 是一站式在线编程学习与竞赛平台，从入门到顶峰的清晰成长路径。',
    type: 'website',
    locale: 'zh_CN',
    images: [
      {
        url: '/logos/dsojlogo.png',
        width: 1024,
        height: 1024,
        alt: '大山 OJ Logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/logos/dsojlogo.png'],
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // 两件事互不依赖，并行读取：会话用户 + 公开设置（品牌/注册开关）
  const [initialUser, initialSettings] = await Promise.all([
    getServerSessionUser(),
    getPublicSettings(),
  ])

  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        {/* 跳到主内容：键盘用户的第一个可聚焦元素，避免每页都要 Tab 穿过整条导航。
            目标 #main-content 由 PageShell（前台）与 AdminLayout（后台）的 <main> 提供。 */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
        >
          跳到主内容
        </a>
        <SwrProvider>
          <SettingsProvider initialSettings={initialSettings}>
            <UserProvider initialUser={initialUser}>
              <DialogProvider>
                <DocumentTitleProvider />
                <NavigationProgress />
                <Navbar />
                <PageTransition>
                  <MainLandmark>{children}</MainLandmark>
                </PageTransition>
              </DialogProvider>
              <Toaster
                position="top-right"
                containerStyle={{
                  top: 'calc(var(--navbar-height) + 0.75rem)',
                  zIndex: 'var(--z-toast)',
                }}
                toastOptions={{
                  duration: 3000,
                  style: {
                    background: 'var(--background-secondary)',
                    color: 'var(--foreground)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '0.75rem 1rem',
                    boxShadow: 'var(--shadow-lg)',
                  },
                  success: {
                    iconTheme: {
                      primary: 'var(--success)',
                      secondary: 'var(--foreground)',
                    },
                  },
                  error: {
                    iconTheme: {
                      primary: 'var(--error)',
                      secondary: 'var(--foreground)',
                    },
                  },
                }}
              />
            </UserProvider>
          </SettingsProvider>
        </SwrProvider>
      </body>
    </html>
  )
}

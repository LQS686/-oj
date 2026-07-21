import type { Metadata } from "next"
import "./globals.css"
import Navbar from "@/components/Navbar"
import { UserProvider } from "@/contexts/UserContext"
import { SettingsProvider } from "@/contexts/SettingsContext"
import { SwrProvider } from "@/components/SwrProvider"
import { Toaster } from "react-hot-toast"
import DocumentTitleProvider from "@/components/DocumentTitleProvider"
import { SITE_TITLE_SUFFIX } from "@/lib/document-title"
import PageTransition from "@/components/common/PageTransition"
import { DialogProvider } from "@/components/common/DialogProvider"

export const metadata: Metadata = {
  title: `首页 - ${SITE_TITLE_SUFFIX}`,
  description: "代码如山·算法为径。大山 OJ 是一站式在线编程学习与竞赛平台，从入门到顶峰的清晰成长路径。",
  keywords: ["大山 OJ", "OJ", "编程", "算法", "竞赛", "题库", "在线评测", "学习平台", "训练"],
  authors: [{ name: "Dashan OJ Team" }],
  icons: {
    icon: [{ url: "/logos/dsojlogo.png", type: "image/png" }],
    shortcut: "/logos/dsojlogo.png",
    apple: "/logos/dsojlogo.png",
  },
  openGraph: {
    title: `首页 - ${SITE_TITLE_SUFFIX}`,
    description: "代码如山·算法为径。大山 OJ 是一站式在线编程学习与竞赛平台，从入门到顶峰的清晰成长路径。",
    type: "website",
    locale: "zh_CN",
    images: [
      {
        url: "/logos/dsojlogo.png",
        width: 1024,
        height: 1024,
        alt: "大山 OJ Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/logos/dsojlogo.png"],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
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
        <SwrProvider>
          <SettingsProvider>
            <UserProvider>
              <DialogProvider>
                <DocumentTitleProvider />
                <Navbar />
                <PageTransition>{children}</PageTransition>
              </DialogProvider>
              <Toaster
                position="top-right"
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

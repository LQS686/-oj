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

export const metadata: Metadata = {
  title: `首页 - ${SITE_TITLE_SUFFIX}`,
  description: "海量题库、实时评测、专业竞赛，助你从入门到精通",
  keywords: ["OJ", "编程", "算法", "竞赛", "题库", "在线评测"],
  authors: [{ name: "OJ Platform Class" }],
  openGraph: {
    title: `首页 - ${SITE_TITLE_SUFFIX}`,
    description: "海量题库、实时评测、专业竞赛，助你从入门到精通",
    type: "website",
    locale: "zh_CN",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
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
              <DocumentTitleProvider />
              <Navbar />
              <main className="relative min-h-screen">
                <PageTransition>{children}</PageTransition>
              </main>
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

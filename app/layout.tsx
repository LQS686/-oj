import type { Metadata } from "next"
import "./globals.css"
import Navbar from "@/components/Navbar"
import { UserProvider } from "@/contexts/UserContext"
import { SettingsProvider } from "@/contexts/SettingsContext"
import { SwrProvider } from "@/components/SwrProvider"
import { Toaster } from "react-hot-toast"

export const metadata: Metadata = {
  title: "OJ Platform - 在线编程学习平台",
  description: "海量题库、实时评测、专业竞赛，助你从入门到精通",
  keywords: ["OJ", "编程", "算法", "竞赛", "题库", "在线评测"],
  authors: [{ name: "OJ Platform Class" }],
  openGraph: {
    title: "OJ Platform - 在线编程学习平台",
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
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&family=Poppins:wght@400;500;600;700;800&display=swap" 
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <SwrProvider>
          <SettingsProvider>
            <UserProvider>
              <Navbar />
              <main className="relative">
                {children}
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
                    padding: '1rem',
                    backdropFilter: 'blur(24px)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
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

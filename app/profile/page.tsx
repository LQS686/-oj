'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { Loader2 } from 'lucide-react'

export default function ProfilePage() {
  const router = useRouter()
  const { user, isLoading: loading } = useUser()

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace(`/user/${user.id}`)
      } else {
        router.replace('/login')
      }
    }
  }, [user, loading, router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="relative w-16 h-16 mx-auto mb-6">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
          <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
        </div>
        <p className="text-muted-foreground text-lg">正在跳转...</p>
      </div>
    </div>
  )
}

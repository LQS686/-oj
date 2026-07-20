import { Check, X } from 'lucide-react'
import type { SettingsMessage } from '../_types'

interface MessageBannerProps {
  message: SettingsMessage | null
}

/** 顶部消息提示横幅（成功/错误） */
export function MessageBanner({ message }: MessageBannerProps) {
  if (!message) return null

  const isSuccess = message.type === 'success'

  return (
    <div
      className={`mb-6 p-4 rounded-lg flex items-center gap-3 card-static ${
        isSuccess ? 'border-l-4 border-l-secondary bg-secondary/10' : 'border-l-4 border-l-error bg-error/10'
      }`}
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center ${
          isSuccess ? 'bg-secondary/20' : 'bg-error/20'
        }`}
      >
        {isSuccess ? (
          <Check className="w-4 h-4 text-secondary-light" />
        ) : (
          <X className="w-4 h-4 text-red-400" />
        )}
      </div>
      <span className="text-foreground font-medium">{message.text}</span>
    </div>
  )
}

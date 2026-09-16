'use client'

import { useState } from 'react'
import Link from 'next/link'
import { RotateCcw, UserPlus, Database, ShieldCheck } from 'lucide-react'
import { GuestAuthShell } from '@/components/common'
import RestoreWizard from '@/components/backup/RestoreWizard'

export default function SetupPage() {
  const [showRestore, setShowRestore] = useState(false)

  return (
    <GuestAuthShell
      maxWidthClass="max-w-lg"
      subtitle="新站部署引导：从备份恢复现有数据，或全新注册系统管理员"
    >
      <div className="space-y-4">
        {!showRestore ? (
          <>
            {/* 从备份恢复 */}
            <button
              type="button"
              onClick={() => setShowRestore(true)}
              className="group relative w-full rounded-2xl border border-border bg-background-secondary p-5 text-left transition-all hover:border-primary/50 hover:bg-primary/5"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 rounded-xl bg-primary/10 p-3">
                  <RotateCcw className="w-6 h-6 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-subsection-title font-semibold text-foreground">从备份恢复</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    本站已有备份数据（.dsoj.gz），上传后完整还原数据库与上传文件。
                  </p>
                </div>
              </div>
            </button>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              或
              <span className="h-px flex-1 bg-border" />
            </div>

            {/* 全新注册 */}
            <Link
              href="/register"
              className="group relative block w-full rounded-2xl border border-border bg-background-secondary p-5 text-left transition-all hover:border-primary/50 hover:bg-primary/5"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 rounded-xl bg-primary/10 p-3">
                  <UserPlus className="w-6 h-6 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-subsection-title font-semibold text-foreground">全新注册</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    当前站点尚无任何用户，注册后将自动成为系统管理员。
                  </p>
                </div>
              </div>
            </Link>
          </>
        ) : (
          <div className="rounded-2xl border border-border bg-background-secondary p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              <h2 className="text-subsection-title font-semibold text-foreground">从备份恢复</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              上传备份包后将覆盖还原数据库与上传文件。若备份包含系统密钥，需输入对应的「恢复口令」。
            </p>
            <RestoreWizard
              endpoint="/api/setup/restore"
              requireConfirm={false}
              compact
              onDone={() => {
                setTimeout(() => {
                  window.location.href = '/'
                }, 1000)
              }}
            />
            <button
              type="button"
              onClick={() => setShowRestore(false)}
              className="text-xs text-muted-foreground hover:text-primary"
            >
              ← 返回选择
            </button>
          </div>
        )}

        <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground/70">
          <ShieldCheck className="w-4 h-4" />
          引导页仅在未注册系统管理员时显示
        </div>
      </div>
    </GuestAuthShell>
  )
}

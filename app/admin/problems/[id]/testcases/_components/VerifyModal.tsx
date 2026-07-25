'use client'

import { CheckCircle, Loader2 } from 'lucide-react'
import { Modal } from '@/components/common'
import CodeEditor, { type CodeLanguage } from '@/components/code-editor/CodeEditor'

interface VerifyModalProps {
  open: boolean
  onClose: () => void
  verifying: boolean
  solutionCode: string
  solutionLanguage: string
  onCodeChange: (code: string) => void
  onLanguageChange: (lang: string) => void
  onVerify: () => void
}

const LANG_OPTIONS: { value: CodeLanguage; label: string }[] = [
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'python', label: 'Python' },
]

export function VerifyModal({
  open,
  onClose,
  verifying,
  solutionCode,
  solutionLanguage,
  onCodeChange,
  onLanguageChange,
  onVerify,
}: VerifyModalProps) {
  const lang = (LANG_OPTIONS.some((l) => l.value === solutionLanguage)
    ? solutionLanguage
    : 'cpp') as CodeLanguage

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="标程验证与输出纠正"
      icon={<CheckCircle className="w-5 h-5 text-primary" />}
      closeOnOverlayClick={!verifying}
      closeOnEsc={!verifying}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-ghost" disabled={verifying}>
            取消
          </button>
          <button
            type="button"
            onClick={onVerify}
            disabled={verifying || !solutionCode.trim()}
            className="btn btn-primary gap-2"
          >
            {verifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                验证中…
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                开始验证
              </>
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm text-foreground">
          <p className="font-medium mb-1">将执行以下操作：</p>
          <ul className="list-disc list-inside space-y-0.5 text-muted-foreground text-xs sm:text-sm">
            <li>使用标程跑完<strong className="text-foreground">已保存</strong>的全部测试点输入</li>
            <li>成功后<strong className="text-foreground">覆盖</strong>各测试点的输出数据</li>
            <li>将标程代码保存到题目（stdCode），供导出与后续验证</li>
          </ul>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">标程语言</label>
          <select
            value={lang}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="input"
            disabled={verifying}
          >
            {LANG_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            标程代码 <span className="text-error">*</span>
          </label>
          <CodeEditor
            value={solutionCode}
            onChange={onCodeChange}
            language={lang}
            height="320px"
            readOnly={verifying}
            placeholder="// 粘贴正确的解题代码…"
          />
        </div>
      </div>
    </Modal>
  )
}

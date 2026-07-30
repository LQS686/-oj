'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft,
  Plus,
  Loader2,
  Save,
  CheckCircle,
  AlertCircle,
  Clock,
  Database,
  Scale,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import {
  distributeTestCaseScores,
  ensureTotalScoreIs100,
} from '@/lib/problem/testcase-scoring'
import { AdminPageShell } from '@/components/admin'
import { PageLoading, useDialog } from '@/components/common'
import { ZipUploadPanel } from './_components/ZipUploadPanel'
import { TestCaseCard, type EditableTestCase } from './_components/TestCaseCard'
import { VerifyModal } from './_components/VerifyModal'
import { LogsModal } from './_components/LogsModal'

type TestCase = EditableTestCase

interface VerificationLog {
  id: string
  status: string
  details?: {
    passed?: number
    failed?: number
    fixedCount?: number
    compileError?: string
  } | null
  createdAt: string
}

interface RawTestCase {
  input?: string | null
  output?: string | null
  inputPreview?: string | null
  outputPreview?: string | null
  isSample?: boolean | null
  score?: number | null
  timeLimit?: number | null
  memoryLimit?: number | null
}

function serializeCases(cases: TestCase[]): string {
  return JSON.stringify(
    cases.map((tc) => ({
      input: tc.input,
      output: tc.output,
      isSample: tc.isSample,
      score: tc.score,
      timeLimit: tc.timeLimit ?? null,
      memoryLimit: tc.memoryLimit ?? null,
    }))
  )
}

export default function ProblemTestCasesPage() {
  const dialog = useDialog()
  const router = useRouter()
  const params = useParams()
  const problemId = params.id as string

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{
    success: boolean
    message: string
    count?: number
  } | null>(null)

  const [problemTitle, setProblemTitle] = useState('')
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [savedSnapshot, setSavedSnapshot] = useState('[]')
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [solutionCode, setSolutionCode] = useState('')
  const [solutionLanguage, setSolutionLanguage] = useState('cpp')

  const [showLogsModal, setShowLogsModal] = useState(false)
  const [logs, setLogs] = useState<VerificationLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  const successMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dirty = useMemo(
    () => serializeCases(testCases) !== savedSnapshot,
    [testCases, savedSnapshot]
  )

  const totalScore = useMemo(
    () => testCases.reduce((sum, tc) => sum + (Number(tc.score) || 0), 0),
    [testCases]
  )

  useEffect(() => {
    return () => {
      if (successMsgTimerRef.current) clearTimeout(successMsgTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const res = await fetchWithCookie(`/api/admin/problems/${problemId}/verification-logs`)
      const data = await res.json()
      if (data.success) {
        setLogs(Array.isArray(data.data) ? data.data : [])
      }
    } catch (err) {
      logger.error('Failed to fetch logs', err)
    } finally {
      setLogsLoading(false)
    }
  }, [problemId])

  useDeferredEffect(() => {
    if (showLogsModal) void fetchLogs()
  }, [showLogsModal, fetchLogs])

  const applyCases = useCallback((cases: TestCase[], markSaved = false) => {
    const normalized = cases
    setTestCases(normalized)
    setExpanded((prev) => {
      const next: Record<number, boolean> = {}
      normalized.forEach((_, i) => {
        next[i] = prev[i] ?? normalized.length <= 4
      })
      return next
    })
    if (markSaved) setSavedSnapshot(serializeCases(normalized))
  }, [])

  const fetchProblemData = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const response = await fetchWithCookie(`/api/admin/problems/${problemId}`)
      if (!response.ok) throw new Error('Failed to fetch problem')
      const data = await response.json()
      if (!data.success) {
        setError(data.error || '获取题目数据失败')
        return
      }
      const problem = data.data
      setProblemTitle(problem.title || '')
      if (problem.stdCode) setSolutionCode(problem.stdCode)
      if (problem.stdLang) setSolutionLanguage(problem.stdLang)

      const cases: TestCase[] = (problem.testCases || []).map((tc: RawTestCase) => ({
        input: tc.input || '',
        output: tc.output || '',
        isSample: !!tc.isSample,
        score: tc.score ?? 0,
        timeLimit: tc.timeLimit ?? null,
        memoryLimit: tc.memoryLimit ?? null,
      }))
      applyCases(cases, true)
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }, [problemId, applyCases])

  useDeferredEffect(() => {
    void fetchProblemData()
  }, [fetchProblemData])

  /** 增删/复制测点时始终重均分（不能用 ensure：总分已是 100 时不会重分） */
  const redistributeScores = (cases: TestCase[]): TestCase[] => {
    if (cases.length === 0) return cases
    return distributeTestCaseScores(cases, 'rebalance')
  }

  const updateCase = (index: number, patch: Partial<TestCase>) => {
    setTestCases((prev) => prev.map((tc, i) => (i === index ? { ...tc, ...patch } : tc)))
  }

  const handleAddTestCase = () => {
    const next = redistributeScores([
      ...testCases,
      { input: '', output: '', isSample: false, score: 0, timeLimit: null, memoryLimit: null },
    ])
    applyCases(next)
    setExpanded((prev) => ({ ...prev, [next.length - 1]: true }))
  }

  const handleRemoveTestCase = async (index: number) => {
    const ok = await dialog.confirm({
      message: `确定删除测试点 #${index + 1}？`,
      tone: 'warning',
      confirmText: '删除',
      confirmVariant: 'destructive',
    })
    if (!ok) return
    applyCases(redistributeScores(testCases.filter((_, i) => i !== index)))
  }

  const handleDuplicate = (index: number) => {
    const copy = { ...testCases[index] }
    const next = [...testCases]
    next.splice(index + 1, 0, copy)
    applyCases(redistributeScores(next))
    setExpanded((prev) => ({ ...prev, [index + 1]: true }))
  }

  const handleMove = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= testCases.length) return
    const next = [...testCases]
    ;[next[index], next[target]] = [next[target], next[index]]
    setTestCases(next)
    setExpanded((prev) => {
      const a = prev[index] ?? false
      const b = prev[target] ?? false
      return { ...prev, [index]: b, [target]: a }
    })
  }

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      await dialog.alert({ tone: 'warning', message: '只支持 ZIP 格式压缩包' })
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      await dialog.alert({ tone: 'warning', message: '压缩包大小不能超过 50MB' })
      return
    }

    setUploading(true)
    setUploadResult(null)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetchWithCookie('/api/admin/testcases/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()

      if (!data.success) {
        setUploadResult({ success: false, message: data.error || '上传失败' })
        setError('测试点上传失败: ' + (data.error || '未知错误'))
        return
      }

      const uploaded = Array.isArray(data.data?.testCases) ? data.data.testCases : []
      const newTestCases: TestCase[] = ensureTotalScoreIs100(
        uploaded.map((tc: RawTestCase) => ({
          input: tc.input ?? tc.inputPreview ?? '',
          output: tc.output ?? tc.outputPreview ?? '',
          isSample: false,
          score: 10,
          timeLimit: null,
          memoryLimit: null,
        }))
      )

      if (testCases.length > 0) {
        const replace = await dialog.confirm({
          message: '是否覆盖现有测试用例？取消将追加到现有列表。',
          confirmText: '覆盖',
          cancelText: '追加',
        })
        applyCases(redistributeScores(replace ? newTestCases : [...testCases, ...newTestCases]))
      } else {
        applyCases(redistributeScores(newTestCases))
      }

      setUploadResult({
        success: true,
        message: data.data?.message || data.message || '解析成功',
        count: data.data?.count,
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '网络错误'
      setUploadResult({ success: false, message: errorMessage })
      setError('上传请求失败: ' + errorMessage)
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async (): Promise<boolean> => {
    setSubmitting(true)
    setError('')
    setSuccessMsg('')

    try {
      let casesToSave = testCases
      if (totalScore !== 100 && testCases.length > 0) {
        const ok = await dialog.confirm({
          title: '分值总和不是 100',
          message: `当前测试点总分为 ${totalScore} 分，应为 100 分。是否自动均分后保存？`,
          tone: 'warning',
          confirmText: '均分并保存',
          cancelText: '取消',
        })
        if (!ok) {
          setSubmitting(false)
          return false
        }
        casesToSave = redistributeScores(testCases)
        applyCases(casesToSave)
      }

      const response = await fetchWithCookie(`/api/admin/problems/${problemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testCases: casesToSave }),
      })
      const data = await response.json()

      if (data.success) {
        setSavedSnapshot(serializeCases(casesToSave))
        setSuccessMsg('测试用例保存成功')
        if (successMsgTimerRef.current) clearTimeout(successMsgTimerRef.current)
        successMsgTimerRef.current = setTimeout(() => {
          setSuccessMsg('')
          successMsgTimerRef.current = null
        }, 3000)
        return true
      }
      setError(data.error || '保存失败')
      return false
    } catch {
      setError('网络错误')
      return false
    } finally {
      setSubmitting(false)
    }
  }

  const handleVerifyWithSolution = async () => {
    if (!solutionCode.trim()) {
      await dialog.alert({ tone: 'warning', message: '请提供标程代码' })
      return
    }

    if (dirty) {
      const saveFirst = await dialog.confirm({
        title: '有未保存的修改',
        message: '标程验证基于已保存的测试点输入。是否先保存再验证？',
        tone: 'warning',
        confirmText: '保存并验证',
        cancelText: '取消',
      })
      if (!saveFirst) return
      const saved = await handleSave()
      if (!saved) return
    }

    if (testCases.length === 0) {
      await dialog.alert({ tone: 'warning', message: '请先添加并保存测试点' })
      return
    }

    setVerifying(true)
    setError('')
    setSuccessMsg('')

    try {
      const response = await fetchWithCookie(`/api/admin/problems/${problemId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solutionCode,
          solutionLanguage,
        }),
      })
      const data = await response.json()

      if (!data.success) {
        setError(data.error || '验证失败')
        return
      }

      const result = data.data
      if (!result?.verified) {
        setError(
          result?.compileError
            ? `标程编译失败：${result.compileError}`
            : result?.message || '验证失败'
        )
        return
      }

      setShowVerifyModal(false)
      setSuccessMsg(result.message || '验证通过')
      await fetchProblemData()
    } catch (err) {
      logger.error('Verify failed', err)
      setError('网络请求失败')
    } finally {
      setVerifying(false)
    }
  }

  const expandAll = (value: boolean) => {
    setExpanded(Object.fromEntries(testCases.map((_, i) => [i, value])))
  }

  const handleBack = async () => {
    if (dirty) {
      const ok = await dialog.confirm({
        message: '有未保存的修改，确定离开？',
        tone: 'warning',
        confirmText: '离开',
        confirmVariant: 'destructive',
      })
      if (!ok) return
    }
    router.push('/admin/problems')
  }

  if (loading) {
    return <PageLoading label="加载测试数据…" />
  }

  return (
    <AdminPageShell width="wide" className="space-y-5">
      {/* 顶栏 */}
      <div className="card p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <button
            type="button"
            onClick={() => void handleBack()}
            className="p-2 -ml-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label="返回"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary">
            <Database className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground flex flex-wrap items-center gap-2">
              测试数据管理
              <span className="text-sm font-normal text-muted-foreground truncate max-w-[16rem]">
                {problemTitle}
              </span>
              {dirty && (
                <span className="text-xs font-medium text-accent bg-accent/10 px-2 py-0.5 rounded">
                  未保存
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              共 {testCases.length} 个测试点 · 总分{' '}
              <span
                className={`font-mono tabular-nums font-semibold ${
                  totalScore === 100 || testCases.length === 0
                    ? 'text-secondary'
                    : 'text-warning'
                }`}
              >
                {totalScore}
              </span>{' '}
              分
              <Link
                href={`/admin/problems/${problemId}/edit`}
                className="ml-2 text-primary-light hover:text-primary"
              >
                编辑题目
              </Link>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowLogsModal(true)}
            className="btn btn-ghost text-sm gap-1.5"
          >
            <Clock className="w-4 h-4" />
            日志
          </button>
          <button
            type="button"
            onClick={() => setShowVerifyModal(true)}
            className="btn btn-ghost text-sm gap-1.5"
          >
            <CheckCircle className="w-4 h-4" />
            标程验证
          </button>
          <button
            type="button"
            onClick={() => applyCases(redistributeScores(testCases))}
            className="btn btn-ghost text-sm gap-1.5"
            disabled={testCases.length === 0}
          >
            <Scale className="w-4 h-4" />
            自动均分
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={submitting || !dirty}
            className="btn btn-primary gap-1.5 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            保存
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-lg flex items-start gap-2 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <pre className="whitespace-pre-wrap break-words font-sans">{error}</pre>
        </div>
      )}
      {successMsg && (
        <div className="bg-success/10 border border-success/30 text-success px-4 py-3 rounded-lg flex items-center gap-2 text-sm">
          <CheckCircle className="w-5 h-5 shrink-0" />
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-1 space-y-4">
          <ZipUploadPanel
            uploading={uploading}
            result={uploadResult}
            onUpload={handleFileUpload}
          />
          <section className="card p-4 text-sm text-muted-foreground space-y-2">
            <h3 className="text-sm font-semibold text-foreground">提示</h3>
            <ul className="list-disc list-inside space-y-1 text-xs leading-relaxed">
              <li>ZIP 内文件需成对，如 <code className="text-foreground">1.in</code> / <code className="text-foreground">1.out</code></li>
              <li>总分建议为 100；可用「自动均分」快速分配</li>
              <li>标程验证会覆盖输出并保存标程代码，请先保存输入</li>
              <li>勾选「样例」的测试点会用于前台在线测试</li>
            </ul>
          </section>
        </div>

        <div className="xl:col-span-2 card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground">测试点列表</h3>
            <div className="flex items-center gap-1.5">
              {testCases.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => expandAll(true)}
                    className="btn btn-ghost text-xs py-1 px-2 gap-1"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                    全部展开
                  </button>
                  <button
                    type="button"
                    onClick={() => expandAll(false)}
                    className="btn btn-ghost text-xs py-1 px-2 gap-1"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                    全部收起
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={handleAddTestCase}
                className="btn btn-ghost text-sm gap-1"
              >
                <Plus className="w-4 h-4" />
                添加测试点
              </button>
            </div>
          </div>

          {testCases.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              暂无测试数据，请上传 ZIP 或手动添加
            </div>
          ) : (
            <div>
              {testCases.map((tc, idx) => (
                <TestCaseCard
                  key={idx}
                  index={idx}
                  total={testCases.length}
                  tc={tc}
                  expanded={!!expanded[idx]}
                  onToggle={() =>
                    setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }))
                  }
                  onChange={(patch) => updateCase(idx, patch)}
                  onRemove={() => void handleRemoveTestCase(idx)}
                  onDuplicate={() => handleDuplicate(idx)}
                  onMove={(dir) => handleMove(idx, dir)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <VerifyModal
        open={showVerifyModal}
        onClose={() => !verifying && setShowVerifyModal(false)}
        verifying={verifying}
        solutionCode={solutionCode}
        solutionLanguage={solutionLanguage}
        onCodeChange={setSolutionCode}
        onLanguageChange={setSolutionLanguage}
        onVerify={() => void handleVerifyWithSolution()}
      />

      <LogsModal
        open={showLogsModal}
        onClose={() => setShowLogsModal(false)}
        loading={logsLoading}
        logs={logs}
      />
    </AdminPageShell>
  )
}

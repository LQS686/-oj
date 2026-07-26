'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable, FilterBar, AdminPageShell, type Column } from '@/components/admin'
import { fetchWithCookie } from '@/lib/api/base'
import { Search, User, FileText, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { formatDateTime, formatMemory, formatTime } from '@/lib/utils'
import { getStatusText } from '@/lib/status'
import {
  isAcceptedStatus,
  isNonFinalSubmissionStatus,
  NON_FINAL_STATUS_QUERY,
  SubmissionStatus,
} from '@/lib/constants/submission-status'

interface Submission {
  id: string
  user: { id?: string; username: string; nickname?: string }
  problem: { title: string; id: string; problemNumber?: string }
  status: string
  language: string
  score: number
  time: number | null
  memory: number | null
  submittedAt: string
}

const STATUS_GROUPS: { key: string; label: string; status: string }[] = [
  { key: 'all', label: '全部', status: 'all' },
  { key: 'ac', label: '通过', status: 'AC' },
  { key: 'failed', label: '失败', status: 'WA,TLE,MLE,CE,RE' },
  { key: 'pending', label: '等待', status: NON_FINAL_STATUS_QUERY },
]

const LANGUAGES = [
  { value: '', label: '全部语言' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'python', label: 'Python' },
]

export default function AdminSubmissionsPage() {
  const router = useRouter()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [language, setLanguage] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalByStatus, setTotalByStatus] = useState<Record<string, number>>({})

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearchQuery(searchInput.trim())
      setPage(1)
    }, 350)
    return () => window.clearTimeout(t)
  }, [searchInput])

  const fetchSubmissions = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const group = STATUS_GROUPS.find((g) => g.key === statusFilter)
      const apiStatus = group?.status ?? 'all'
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      })
      if (apiStatus !== 'all') params.set('status', apiStatus)
      if (language) params.set('language', language)
      if (searchQuery) params.set('keyword', searchQuery)

      const response = await fetchWithCookie(`/api/admin/submissions?${params}`)

      if (response.status === 403) {
        setError('需要管理员权限')
        setTimeout(() => router.push('/403'), 2000)
        return
      }

      const data = await response.json()
      if (data.success) {
        const submissionsData = data.data?.submissions || data.data || []
        setSubmissions(Array.isArray(submissionsData) ? submissionsData : [])
        setTotal(data.data?.total || 0)
        setTotalPages(
          data.data?.totalPages ||
            Math.ceil((data.data?.total || 0) / pageSize) ||
            1
        )
        if (data.data?.totalByStatus) {
          setTotalByStatus(data.data.totalByStatus)
        }
      } else {
        setError(data.error || '获取提交记录失败')
      }
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, statusFilter, language, searchQuery, router])

  useEffect(() => {
    void fetchSubmissions()
  }, [fetchSubmissions])

  const getStatusIcon = (status: string) => {
    if (isAcceptedStatus(status)) {
      return <CheckCircle className="w-4 h-4 text-secondary" />
    }
    if (
      status === SubmissionStatus.WRONG_ANSWER ||
      status === SubmissionStatus.RUNTIME_ERROR ||
      status === SubmissionStatus.COMPILE_ERROR ||
      status === SubmissionStatus.TIME_LIMIT_EXCEEDED ||
      status === SubmissionStatus.MEMORY_LIMIT_EXCEEDED
    ) {
      return <XCircle className="w-4 h-4 text-error" />
    }
    return <AlertCircle className="w-4 h-4 text-info" />
  }

  const getStatusColor = (status: string) => {
    if (isAcceptedStatus(status)) return 'tag-success'
    if (
      status === SubmissionStatus.WRONG_ANSWER ||
      status === SubmissionStatus.RUNTIME_ERROR ||
      status === SubmissionStatus.TIME_LIMIT_EXCEEDED ||
      status === SubmissionStatus.MEMORY_LIMIT_EXCEEDED
    ) {
      return 'tag-error'
    }
    if (status === SubmissionStatus.COMPILE_ERROR) return 'tag-warning'
    if (isNonFinalSubmissionStatus(status)) return 'tag-info'
    return 'tag'
  }

  const sumByNormalizedStatus = (counts: Record<string, number>, match: (status: string) => boolean) =>
    Object.entries(counts).reduce(
      (sum, [status, n]) => (match(status) ? sum + n : sum),
      0
    )

  const globalTotal = Object.values(totalByStatus).reduce((sum, n) => sum + n, 0)
  const activeCount =
    (searchQuery ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (language ? 1 : 0)

  const columns: Column<Submission>[] = [
    {
      key: 'id',
      label: '提交ID',
      render: (value) => (
        <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
          {String(value).slice(0, 8)}
        </span>
      ),
    },
    {
      key: 'problem',
      label: '题目',
      render: (value) => (
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-foreground truncate">
            {value?.problemNumber && (
              <span className="font-mono text-xs text-muted-foreground mr-1.5">
                {value.problemNumber}
              </span>
            )}
            {value?.title || '—'}
          </span>
        </div>
      ),
    },
    {
      key: 'user',
      label: '用户',
      render: (value) => (
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground" />
          <span className="text-foreground">{value?.nickname || value?.username || '—'}</span>
        </div>
      ),
    },
    {
      key: 'status',
      label: '状态',
      render: (value) => (
        <div className="flex items-center gap-2" title={getStatusText(value)}>
          {getStatusIcon(value)}
          <span className={`tag ${getStatusColor(value)}`}>{getStatusText(value)}</span>
        </div>
      ),
    },
    {
      key: 'score',
      label: '分数',
      render: (value) => (
        <span className="font-mono font-semibold tabular-nums">{value ?? 0}</span>
      ),
    },
    {
      key: 'language',
      label: '语言',
      render: (value) => <span className="tag">{value}</span>,
    },
    {
      key: 'time',
      label: '用时 · 内存',
      render: (value, row) => (
        <span className="font-mono text-sm text-muted-foreground tabular-nums whitespace-nowrap">
          {formatTime(value ?? 0)} · {formatMemory(row.memory ?? 0)}
        </span>
      ),
    },
    {
      key: 'submittedAt',
      label: '提交时间',
      render: (value) => (
        <div className="flex items-center gap-2 text-muted-foreground whitespace-nowrap">
          <Clock className="w-4 h-4 shrink-0" />
          <span className="text-sm">{formatDateTime(value)}</span>
        </div>
      ),
    },
  ]

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center">
          <p className="text-error text-lg mb-2">{error}</p>
          {error.includes('权限') && <p className="text-muted-foreground">正在跳转...</p>}
        </div>
      </div>
    )
  }

  return (
    <AdminPageShell width="list" className="space-y-6">
      <FilterBar
        activeCount={activeCount}
        onReset={() => {
          setSearchInput('')
          setSearchQuery('')
          setStatusFilter('all')
          setLanguage('')
          setPage(1)
        }}
      >
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="search"
              placeholder="搜索用户、题目名或题号…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="input pl-10"
            />
          </div>
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-muted">
          {STATUS_GROUPS.map((group) => (
            <button
              key={group.key}
              type="button"
              onClick={() => {
                setStatusFilter(group.key)
                setPage(1)
              }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                statusFilter === group.key
                  ? 'bg-primary text-white'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {group.label}
            </button>
          ))}
        </div>
        <select
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value)
            setPage(1)
          }}
          className="input py-1.5 text-sm w-auto min-w-[7.5rem]"
          aria-label="语言筛选"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.value || 'all'} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
      </FilterBar>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-muted-foreground text-sm">总提交数</div>
          <div className="text-2xl font-bold text-foreground mt-1 tabular-nums">{globalTotal}</div>
        </div>
        <div className="card p-4">
          <div className="text-muted-foreground text-sm">通过 (AC)</div>
          <div className="text-2xl font-bold text-secondary mt-1 tabular-nums">
            {sumByNormalizedStatus(totalByStatus, isAcceptedStatus)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-muted-foreground text-sm">错误</div>
          <div className="text-2xl font-bold text-error mt-1 tabular-nums">
            {(['WA', 'RE', 'CE', 'TLE', 'MLE'] as const).reduce(
              (sum, s) => sum + (totalByStatus[s] || 0),
              0
            )}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-muted-foreground text-sm">等待评测</div>
          <div className="text-2xl font-bold text-info mt-1 tabular-nums">
            {sumByNormalizedStatus(totalByStatus, isNonFinalSubmissionStatus)}
          </div>
        </div>
      </div>

      <DataTable
        data={submissions}
        columns={columns}
        idKey="id"
        loading={loading}
        emptyMessage={
          searchQuery || statusFilter !== 'all' || language
            ? '没有找到匹配的记录'
            : '暂无提交记录'
        }
        onRowClick={(row) => router.push(`/admin/submissions/${row.id}`)}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (size) => {
            setPageSize(size)
            setPage(1)
          },
        }}
      />
    </AdminPageShell>
  )
}

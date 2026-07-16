'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import Link from 'next/link'
import { Users, Search, Plus, Calendar, TrendingUp, X, ChevronLeft, ChevronRight, Globe, Lock, FileText } from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth, fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { useRouter, useSearchParams } from 'next/navigation'
import { canCreateClass } from '@/lib/permissions'
import { formatDate } from '@/lib/utils'
import CreateClassModal from '@/components/class/CreateClassModal'
import {
  EducationalPageShell,
  PageLoading,
  LIST_GRID_CLASS,
  LIST_GRID_CARD_META_ROW,
  LIST_GRID_CARD_TITLE,
  LIST_GRID_CARD_MIDDLE,
  LIST_GRID_CARD_FOOTER,
  listGridCardLinkClass,
} from '@/components/common'

interface Class {
  id: string
  name: string
  description: string
  avatar: string
  isPublic: boolean
  memberCount: number
  maxMembers: number
  createdAt: string
  members?: any[]
  stats?: {
    memberCount: number
    problemCount: number
    assignmentCount: number
    noteCount: number
  }
}

function ClassesPageContent() {
  const { user } = useUser()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)
  const [initialLoading, setInitialLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showMyClasses, setShowMyClasses] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [showClassModal, setShowClassModal] = useState(false)
  const [createClassOpen, setCreateClassOpen] = useState(false)
  const [selectedClass, setSelectedClass] = useState<Class | null>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [canCreate, setCanCreate] = useState(false)

  useEffect(() => {
    if (!user) {
      setCanCreate(false)
      return
    }
    setCanCreate(canCreateClass(user))
  }, [user])

  useEffect(() => {
    if (searchParams.get('create') === '1' && user && canCreate) {
      setCreateClassOpen(true)
      router.replace('/classes', { scroll: false })
    }
  }, [searchParams, user, router, canCreate])

  const fetchClasses = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) {
        setInitialLoading(true)
      } else {
        setLoading(true)
      }
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: '24'
      })
      
      if (searchQuery) params.append('search', searchQuery)
      if (showMyClasses) params.append('myClasses', 'true')

      const headers: any = {}

      const response = await fetchWithAuth(`/api/classes?${params}`, { headers })
      const data = await response.json()

      if (data.success) {
        setClasses(data.data.classes || [])
        setTotalPages(data.data.totalPages || 1)
      } else {
        setClasses([])
        setTotalPages(1)
      }
    } catch (error) {
      logger.error('获取班级列表失败', error)
      setClasses([])
      setTotalPages(1)
    } finally {
      setLoading(false)
      setInitialLoading(false)
    }
  }, [page, searchQuery, showMyClasses, user])

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      fetchClasses()
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [fetchClasses])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchClasses()
  }

  const handleClassClick = async (classData: Class) => {
    if (!user) {
      try {
        const response = await fetchWithCookie(`/api/classes/${classData.id}`)
        const data = await response.json()
        
        if (data.success) {
          setSelectedClass({
            ...classData,
            members: data.data.members || [],
            stats: data.data.stats || {
              memberCount: classData.memberCount,
              problemCount: 0,
              assignmentCount: 0,
              noteCount: 0
            }
          })
          setShowClassModal(true)
        }
      } catch (error) {
        logger.error('获取班级信息失败', error)
      }
      return
    }

    try {
      const response = await fetchWithAuth(`/api/classes/${classData.id}`)
      const data = await response.json()
      
      if (data.success) {
        const isMember = data.data.members.some((m: any) => m.userId === user.id)
        
        if (isMember) {
          router.push(`/classes/${classData.id}`)
        } else {
          setSelectedClass({
            ...classData,
            members: data.data.members || [],
            stats: data.data.stats || {
              memberCount: classData.memberCount,
              problemCount: 0,
              assignmentCount: 0,
              noteCount: 0
            }
          })
          setShowClassModal(true)
        }
      }
    } catch (error) {
      logger.error('获取班级信息失败', error)
    }
  }

  return (
    <>
    <EducationalPageShell
      title="班级"
      description="加入班级，与伙伴一起学习和进步"
      icon={Users}
      actions={
        user && canCreate ? (
          <button type="button" onClick={() => setCreateClassOpen(true)} className="btn btn-primary">
            <Plus className="w-5 h-5" />
            创建班级
          </button>
        ) : undefined
      }
      toolbar={
        <div className="card-static rounded-lg p-4 border border-border">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex-1 relative min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
                <input
                  type="text"
                  placeholder="搜索班级名称或描述..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all text-sm"
                />
              </div>
            </div>
            {user && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowMyClasses(true)
                    setPage(1)
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    showMyClasses
                      ? 'bg-primary text-white shadow-md'
                      : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
                  }`}
                >
                  我的班级
                </button>
                <button
                  onClick={() => {
                    setShowMyClasses(false)
                    setPage(1)
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    !showMyClasses
                      ? 'bg-primary text-white shadow-md'
                      : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
                  }`}
                >
                  所有班级
                </button>
              </div>
            )}
          </div>
        </div>
      }
    >
        {initialLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card rounded-lg p-5 border border-border animate-pulse">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-muted" />
                  <div className="flex-1">
                    <div className="h-4 w-2/3 rounded bg-muted mb-2" />
                    <div className="h-3 w-1/2 rounded bg-muted" />
                  </div>
                </div>
                <div className="h-3 w-full rounded bg-muted mb-2" />
                <div className="h-3 w-3/4 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : classes.length === 0 ? (
          <div className="card-static rounded-lg p-16 text-center border border-border animate-fadeIn">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="text-foreground text-xl font-semibold mb-2">
              {showMyClasses ? '你还没有加入任何班级' : '暂无班级'}
            </div>
            <div className="text-muted-foreground mb-6">
              {showMyClasses ? '加入一个班级开始协作学习吧' : '成为第一个创建班级的人'}
            </div>
            {user && !showMyClasses && canCreate && (
              <button
                type="button"
                onClick={() => setCreateClassOpen(true)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-white font-medium shadow-md hover:shadow-lg transition-all"
              >
                <Plus className="w-5 h-5" />
                创建第一个班级
              </button>
            )}
          </div>
        ) : (
          <div className="animate-fadeIn">
            {loading && (
              <div className="flex justify-center py-4 mb-4">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
              </div>
            )}
            <div className={LIST_GRID_CLASS}>
              {classes.map((classData) => (
                <ClassCard key={classData.id} classData={classData} onClassClick={handleClassClick} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center">
                <div className="flex items-center gap-2 card-static rounded-xl p-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="btn btn-ghost px-3 py-2"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pageNum = i + 1
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`w-10 h-10 rounded-lg font-semibold transition-all ${
                            page === pageNum
                              ? 'bg-primary text-white shadow-lg'
                              : 'text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                    {totalPages > 5 && (
                      <>
                        <span className="px-2 text-muted-foreground">...</span>
                        <button
                          onClick={() => setPage(totalPages)}
                          className={`w-10 h-10 rounded-lg font-semibold transition-all ${
                            page === totalPages
                              ? 'bg-primary text-white shadow-lg'
                              : 'text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
                          }`}
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                    className="btn btn-ghost px-3 py-2"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
    </EducationalPageShell>

      {showClassModal && selectedClass && (
        <ClassDetailModal
          classData={selectedClass}
          onClose={() => setShowClassModal(false)}
          user={user}
          router={router}
        />
      )}
      <CreateClassModal
        open={createClassOpen}
        onClose={() => setCreateClassOpen(false)}
        onCreated={() => void fetchClasses()}
      />
    </>
  )
}

export default function ClassesPage() {
  return (
    <Suspense fallback={<PageLoading label="加载班级中..." />}>
      <ClassesPageContent />
    </Suspense>
  )
}

function ClassDetailModal({ classData, onClose, user, router }: { classData: Class, onClose: () => void, user: any, router: any }) {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleJoinClass = async () => {
    if (!user) {
      router.push('/login')
      return
    }

    if (!message.trim()) {
      alert('请填写申请理由')
      return
    }

    try {
      setLoading(true)
      const response = await fetchWithAuth(`/api/classes/${classData.id}/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message })
      })

      const data = await response.json()

      if (data.success) {
        setSuccess(true)
        setTimeout(() => {
          setSuccess(false)
          onClose()
        }, 2000)
      } else {
        alert(data.error || '提交申请失败')
      }
    } catch (error) {
      logger.error('提交申请失败', error)
      alert('网络错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110] p-4" onClick={onClose}>
      <div className="card-static rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">班级详情</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-primary-light transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-start gap-4">
            {classData.avatar ? (
              <img
                src={classData.avatar}
                alt={classData.name}
                className="w-20 h-20 rounded-full object-cover ring-2 ring-primary/20"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center shadow-lg">
                <Users className="w-10 h-10 text-white" />
              </div>
            )}
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-foreground mb-2">{classData.name}</h2>
              <p className="text-muted-foreground mb-3">{classData.description || '暂无描述'}</p>
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-primary-light" />
                  <span>{classData.stats?.memberCount || 0} / {classData.maxMembers} 成员</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-primary-light" />
                  <span>{formatDate(classData.createdAt)}</span>
                </div>
                {classData.isPublic ? (
                  <span className="tag tag-success flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    公开
                  </span>
                ) : (
                  <span className="tag tag-warning flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    私有
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card-static p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-primary-light">{classData.stats?.memberCount || 0}</div>
              <div className="text-sm text-muted-foreground">成员数</div>
            </div>
            <div className="card-static p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-secondary-light">{classData.stats?.problemCount || 0}</div>
              <div className="text-sm text-muted-foreground">题目数</div>
            </div>
            <div className="card-static p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-accent-light">{classData.stats?.assignmentCount || 0}</div>
              <div className="text-sm text-muted-foreground">作业数</div>
            </div>
            <div className="card-static p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-error">{classData.stats?.noteCount || 0}</div>
              <div className="text-sm text-muted-foreground">笔记数</div>
            </div>
          </div>

          {success ? (
            <div className="card-static rounded-xl p-6 text-center border border-secondary/30 bg-secondary/5">
              <div className="w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-6 h-6 text-secondary-light" />
              </div>
              <div className="text-secondary-light font-semibold mb-2">申请已提交</div>
              <p className="text-muted-foreground">请等待管理员审批，2秒后自动关闭...</p>
            </div>
          ) : (
            <div className="card-static rounded-xl p-6">
              <h4 className="font-semibold text-foreground mb-4">申请加入班级</h4>
              <div className="mb-4">
                <label className="block text-sm font-medium text-foreground mb-2">
                  申请理由
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="请简要说明您申请加入班级的理由..."
                  maxLength={500}
                  className="input min-h-[120px] resize-none"
                  rows={4}
                />
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-muted-foreground">请填写申请理由，以便管理员审核</p>
                  <span className="text-xs text-muted-foreground">{message.length}/500</span>
                </div>
              </div>
              <button
                onClick={handleJoinClass}
                disabled={loading}
                className="btn btn-primary w-full"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    提交申请中...
                  </>
                ) : (
                  '申请加入班级'
                )}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end p-6 border-t border-border">
          <button
            onClick={onClose}
            disabled={loading}
            className="btn btn-outline"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

function ClassCard({
  classData,
  onClassClick,
}: {
  classData: Class
  onClassClick: (classData: Class) => void
}) {
  return (
    <Link
      href={`/classes/${classData.id}`}
      onClick={(e) => {
        e.preventDefault()
        onClassClick(classData)
      }}
      className={listGridCardLinkClass('cursor-pointer')}
    >
      <div className={LIST_GRID_CARD_META_ROW}>
        {classData.avatar ? (
          <img
            src={classData.avatar}
            alt={classData.name}
            className="w-8 h-8 rounded-full object-cover ring-2 ring-primary/20 shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 text-primary-foreground" />
          </div>
        )}
        {classData.isPublic ? (
          <Globe className="w-4 h-4 text-secondary shrink-0" aria-label="公开" />
        ) : (
          <Lock className="w-4 h-4 text-accent shrink-0" aria-label="私密" />
        )}
      </div>
      <div className={LIST_GRID_CARD_MIDDLE}>
        <h3 className={LIST_GRID_CARD_TITLE}>{classData.name}</h3>
      </div>
      <div className={`space-y-1 overflow-hidden ${LIST_GRID_CARD_FOOTER}`}>
        <span className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 shrink-0" />
          {classData.memberCount}/{classData.maxMembers} 成员
        </span>
        <span className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 shrink-0" />
          {classData.stats?.assignmentCount ?? 0} 作业
        </span>
        <span className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          {formatDate(classData.createdAt)}
        </span>
      </div>
    </Link>
  )
}

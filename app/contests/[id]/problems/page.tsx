'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, XCircle, MinusCircle, AlertCircle, FileText } from 'lucide-react'

interface Problem {
  id: string
  orderIndex: number
  score: number
  label: string
  title: string
  difficulty: string
  accepted: number
  submitted: number
  status: 'Accepted' | 'Attempted' | null
}

export default function ContestProblemsPage() {
  const params = useParams()
  const router = useRouter()
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchProblems()
  }, [])

  const fetchProblems = async () => {
    try {
      const res = await fetch(`/api/contests/${params.id}/problems`)
      const data = await res.json()
      
      if (data.success) {
        setProblems(data.data)
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('加载失败')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="card rounded-2xl p-8">
      <div className="space-y-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton h-14 rounded-xl"></div>
        ))}
      </div>
    </div>
  )
  
  if (error) {
    return (
      <div className="card rounded-2xl p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-8 h-8 text-error" />
        </div>
        <p className="text-foreground text-lg font-medium mb-2">{error}</p>
        <p className="text-muted-foreground mb-6">可能原因：竞赛未开始、未报名或无权访问</p>
        <button 
          onClick={() => router.push(`/contests/${params.id}`)} 
          className="btn btn-primary"
        >
          返回概览
        </button>
      </div>
    )
  }

  return (
    <div className="card rounded-2xl overflow-hidden">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">状态</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">编号</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">题目</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-32">通过率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {problems.map((p) => (
                <tr key={p.id} className="hover:bg-primary/5 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    {p.status === 'Accepted' ? (
                      <CheckCircle className="w-5 h-5 text-secondary-light"/>
                    ) : p.status === 'Attempted' ? (
                      <XCircle className="w-5 h-5 text-error"/>
                    ) : (
                      <MinusCircle className="w-5 h-5 text-muted-foreground/30"/>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-bold text-primary-light text-lg">
                      {p.label}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Link 
                      href={`/contests/${params.id}/problems/${p.id}`} 
                      className="text-foreground hover:text-primary-light font-medium text-lg transition-colors"
                    >
                      {p.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-muted-foreground">
                      {p.submitted > 0 
                        ? `${((p.accepted / p.submitted) * 100).toFixed(1)}%`
                        : '0.0%'
                      }
                      <span className="text-xs text-muted-foreground/60 ml-2">
                        ({p.accepted}/{p.submitted})
                      </span>
                    </div>
                  </td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { ArrowLeft, Plus, X, Save, Loader2, FileText, Sparkles } from 'lucide-react'
import { DIFFICULTIES } from '@/lib/constants'

interface Sample {
  input: string
  output: string
  explanation?: string
}

interface AIGeneratedData {
  title: string
  description: string
  difficulty: string
  tags: string[]
  inputFormat: string
  outputFormat: string
  samples: Sample[]
  hints: string[]
}

export default function CreateProblemPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const aiData = searchParams.get('ai')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [problemNumber, setProblemNumber] = useState('')
  const [title, setTitle] = useState('')
  const [difficulty, setDifficulty] = useState('入门')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [timeLimit, setTimeLimit] = useState(1000)
  const [memoryLimit, setMemoryLimit] = useState(128)
  const [visibility, setVisibility] = useState('private')

  const [description, setDescription] = useState('')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [hint, setHint] = useState('')
  const [source, setSource] = useState('')

  const [samples, setSamples] = useState<Sample[]>([{ input: '', output: '', explanation: '' }])

  useEffect(() => {
    if (aiData) {
      try {
        const data: AIGeneratedData = JSON.parse(decodeURIComponent(aiData))
        setTitle(data.title)
        setDescription(data.description)
        setDifficulty(data.difficulty)
        setTags(data.tags || [])
        setInput(data.inputFormat || '')
        setOutput(data.outputFormat || '')
        setHint(data.hints?.join('\n') || '')
        if (data.samples && data.samples.length > 0) {
          setSamples(data.samples)
        }
      } catch (e) {
        logger.error('解析 AI 数据失败', e)
      }
    }
  }, [aiData])

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()])
      setTagInput('')
    }
  }

  const handleRemoveTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index))
  }

  const handleAddSample = () => {
    setSamples([...samples, { input: '', output: '', explanation: '' }])
  }

  const handleRemoveSample = (index: number) => {
    setSamples(samples.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!title.trim()) {
      setError('请填写题目标题')
      return
    }

    if (!description.trim()) {
      setError('请填写题目描述')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const response = await fetchWithAuth('/api/admin/problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemNumber: problemNumber.trim() || null,
          title: title.trim(),
          description,
          input,
          output,
          samples: samples.filter(s => s.input || s.output),
          hint: hint || null,
          source: source || null,
          difficulty,
          tags,
          timeLimit,
          memoryLimit,
          isPublic: visibility === 'public',
          visibility,
          aiStatus: aiData ? 'AI_ASSISTED' : 'MANUAL_CREATED'
        })
      })

      const data = await response.json()

      if (data.success) {
        router.push('/admin/problems')
      } else {
        setError(data.error || '创建失败')
      }
    } catch (err) {
      setError('网络错误')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)' }}>
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">创建题目</h1>
              <p className="text-sm text-slate-400">添加新的编程题目</p>
            </div>
          </div>
          {aiData && (
            <span className="tag tag-primary flex items-center gap-1 ml-2">
              <Sparkles className="w-3 h-3" />
              AI 辅助
            </span>
          )}
        </div>

        {error && (
          <div className="bg-error/100/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-bold text-white mb-4">基本信息</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  题目编号（可选）
                </label>
                <input
                  type="text"
                  value={problemNumber}
                  onChange={(e) => setProblemNumber(e.target.value)}
                  placeholder="如：P1001"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  难度 <span className="text-red-400">*</span>
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="input"
                >
                  {DIFFICULTIES.map(diff => (
                    <option key={diff} value={diff}>{diff}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                题目标题 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="输入题目标题"
                className="input"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">标签</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  placeholder="输入标签后按回车"
                  className="input flex-1"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="btn btn-primary"
                >
                  添加
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="tag flex items-center gap-2"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(idx)}
                      className="hover:text-red-400"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  时间限制（ms）
                </label>
                <input
                  type="number"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(parseInt(e.target.value) || 1000)}
                  min="100"
                  max="10000"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  内存限制（MB）
                </label>
                <input
                  type="number"
                  value={memoryLimit}
                  onChange={(e) => setMemoryLimit(parseInt(e.target.value) || 128)}
                  min="32"
                  max="1024"
                  className="input"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-slate-300">题目可见性：</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                className="input w-auto"
              >
                <option value="public">公开 (Public)</option>
                <option value="private">隐藏 (Private)</option>
                <option value="contest">竞赛专用 (Contest)</option>
              </select>
              <span className="text-xs text-muted-foreground">
                {visibility === 'public' && '题目将在题库中对所有用户可见'}
                {visibility === 'private' && '题目仅管理员可见（草稿状态）'}
                {visibility === 'contest' && '题目仅在竞赛中可见'}
              </span>
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-bold text-white mb-4">题目描述</h2>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                题目描述 <span className="text-red-400">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={8}
                placeholder="详细描述题目要求..."
                className="input min-h-[200px] font-mono text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">输入格式</label>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={4}
                placeholder="描述输入格式..."
                className="input font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">输出格式</label>
              <textarea
                value={output}
                onChange={(e) => setOutput(e.target.value)}
                rows={4}
                placeholder="描述输出格式..."
                className="input font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">提示（可选）</label>
              <textarea
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                rows={3}
                placeholder="给出解题提示..."
                className="input font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">来源（可选）</label>
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="如：NOIP 2020 普及组"
                className="input"
              />
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white">样例</h2>
              <button
                type="button"
                onClick={handleAddSample}
                className="btn btn-ghost text-sm flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                添加样例
              </button>
            </div>

            {samples.map((sample, idx) => (
              <div key={idx} className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium text-slate-300">样例 {idx + 1}</h3>
                  {samples.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSample(idx)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">输入</label>
                    <textarea
                      value={sample.input}
                      onChange={(e) => {
                        const newSamples = [...samples]
                        newSamples[idx].input = e.target.value
                        setSamples(newSamples)
                      }}
                      rows={3}
                      className="input font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">输出</label>
                    <textarea
                      value={sample.output}
                      onChange={(e) => {
                        const newSamples = [...samples]
                        newSamples[idx].output = e.target.value
                        setSamples(newSamples)
                      }}
                      rows={3}
                      className="input font-mono text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">说明（可选）</label>
                  <input
                    type="text"
                    value={sample.explanation || ''}
                    onChange={(e) => {
                      const newSamples = [...samples]
                      newSamples[idx].explanation = e.target.value
                      setSamples(newSamples)
                    }}
                    className="input text-sm"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="btn btn-ghost flex-1"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  创建中...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  创建题目
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  )
}

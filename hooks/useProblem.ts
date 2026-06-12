/**
 * hooks/useProblem.ts
 * 获取题目详情 - 走 SWR
 */
'use client'

import useSWR from 'swr'
import { swrKey } from '@/lib/api/swr'

export interface ProblemDetail {
  id: string
  title: string
  problemNumber?: string
  description: string
  difficulty: 'easy' | 'medium' | 'hard'
  timeLimit: number
  memoryLimit: number
  isPublic: boolean
  tags: string[]
  examples?: any[]
  hint?: string
  source?: string
  [k: string]: any
}

export function useProblem(problemId: string | null | undefined) {
  const { data, error, isLoading, mutate } = useSWR<ProblemDetail>(
    problemId ? swrKey.problem(problemId) : null
  )
  return {
    problem: data ?? null,
    isLoading,
    error,
    mutate,
  }
}

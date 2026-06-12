/**
 * hooks/useContest.ts
 * 竞赛详情 + 榜单 - 走 SWR
 */
'use client'

import useSWR from 'swr'
import { swrKey } from '@/lib/api/swr'

export interface ContestDetail {
  id: string
  title: string
  description?: string
  type: string
  startTime: string
  endTime: string
  isPublic: boolean
  [k: string]: any
}

export interface ContestRankItem {
  userId: string
  username: string
  nickname: string | null
  avatar: string | null
  score: number
  rank?: number
}

export function useContest(contestId: string | null | undefined) {
  const { data, error, isLoading, mutate } = useSWR<ContestDetail>(
    contestId ? swrKey.contest(contestId) : null
  )
  return {
    contest: data ?? null,
    isLoading,
    error,
    mutate,
  }
}

export function useContestRank(contestId: string | null | undefined) {
  const { data, error, isLoading, mutate } = useSWR<ContestRankItem[]>(
    contestId ? swrKey.contestRank(contestId) : null,
    { refreshInterval: 30_000 } // 30s 刷新
  )
  return {
    rank: data ?? [],
    isLoading,
    error,
    mutate,
  }
}

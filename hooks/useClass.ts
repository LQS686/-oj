/**
 * hooks/useClass.ts
 * 获取班级详情 + 成员列表 - 走 SWR
 */
'use client'

import useSWR from 'swr'
import { swrKey } from '@/lib/api/swr'

export interface ClassDetail {
  id: string
  name: string
  description?: string
  isPublic: boolean
  creatorId: string
  memberCount?: number
  createdAt: string
  [k: string]: any
}

export interface ClassMember {
  id: string
  userId: string
  classId: string
  role: 'teacher' | 'assistant' | 'student'
  joinedAt: string
  user?: {
    id: string
    username: string
    nickname: string | null
    avatar: string | null
  }
}

export function useClass(classId: string | null | undefined) {
  const { data, error, isLoading, mutate } = useSWR<ClassDetail>(
    classId ? swrKey.class(classId) : null
  )
  return {
    classData: data ?? null,
    isLoading,
    error,
    mutate,
  }
}

export function useClassMembers(classId: string | null | undefined) {
  const { data, error, isLoading, mutate } = useSWR<ClassMember[]>(
    classId ? swrKey.classMembers(classId) : null
  )
  return {
    members: data ?? [],
    isLoading,
    error,
    mutate,
  }
}

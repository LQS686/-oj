/**
 * tests/submission-status.test.ts
 * 状态机单元测试（仅枚举字面量，无历史兼容）
 */
import { describe, it, expect } from 'vitest'
import {
  SubmissionStatus,
  canTransition,
  isAcceptedStatus,
  isCompileErrorStatus,
  isNonFinalSubmissionStatus,
  isSubmissionStatus,
  normalizeStatus,
} from '../lib/constants/submission-status'

describe('SubmissionStatus', () => {
  describe('枚举值', () => {
    it('应包含标准状态', () => {
      const keys = Object.keys(SubmissionStatus)
      expect(keys.length).toBeGreaterThanOrEqual(13)
      expect(SubmissionStatus.PENDING).toBe('PENDING')
      expect(SubmissionStatus.JUDGING).toBe('JUDGING')
      expect(SubmissionStatus.ACCEPTED).toBe('AC')
      expect(SubmissionStatus.WRONG_ANSWER).toBe('WA')
      expect(SubmissionStatus.SYSTEM_ERROR).toBe('SE')
    })
  })

  describe('isSubmissionStatus', () => {
    it('应接受标准枚举值', () => {
      expect(isSubmissionStatus('AC')).toBe(true)
      expect(isSubmissionStatus('WA')).toBe(true)
      expect(isSubmissionStatus('CE')).toBe(true)
      expect(isSubmissionStatus('SE')).toBe(true)
      expect(isSubmissionStatus('PENDING')).toBe(true)
      expect(isSubmissionStatus('JUDGING')).toBe(true)
    })

    it('应拒绝非枚举写法与非法值', () => {
      expect(isSubmissionStatus('Pending')).toBe(false)
      expect(isSubmissionStatus('Accepted')).toBe(false)
      expect(isSubmissionStatus('FOO')).toBe(false)
      expect(isSubmissionStatus('')).toBe(false)
      expect(isSubmissionStatus(null)).toBe(false)
      expect(isSubmissionStatus(undefined)).toBe(false)
      expect(isSubmissionStatus(123)).toBe(false)
    })
  })

  describe('canTransition', () => {
    it('应允许 PENDING -> JUDGING', () => {
      expect(canTransition('PENDING', 'JUDGING')).toBe(true)
    })

    it('应允许 JUDGING -> AC', () => {
      expect(canTransition('JUDGING', 'AC')).toBe(true)
    })

    it('应允许任意中间状态 -> SE', () => {
      expect(canTransition('JUDGING', 'SE')).toBe(true)
      expect(canTransition('PENDING', 'SE')).toBe(true)
      expect(canTransition('WA', 'SE')).toBe(true)
    })

    it('应拒绝 AC -> WA（已终态）', () => {
      expect(canTransition('AC', 'WA')).toBe(false)
    })

    it('PENDING -> AC 不允许（必须经 JUDGING）', () => {
      expect(canTransition('PENDING', 'AC')).toBe(false)
    })

    it('空状态应放行（recover 场景）', () => {
      expect(canTransition('', 'PENDING')).toBe(true)
    })

    it('未知非空源状态应拒绝（fail-closed）', () => {
      expect(canTransition('UNKNOWN_STATUS', 'AC')).toBe(false)
      expect(canTransition('QUEUED', 'PENDING')).toBe(false)
      expect(canTransition('Pending', 'AC')).toBe(false)
    })

    it('同状态到同状态应被拒绝', () => {
      expect(canTransition('AC', 'AC')).toBe(false)
    })
  })

  describe('normalizeStatus', () => {
    it('应保留枚举短码不变', () => {
      expect(normalizeStatus('AC')).toBe('AC')
      expect(normalizeStatus('WA')).toBe('WA')
      expect(normalizeStatus('PENDING')).toBe('PENDING')
    })

    it('非枚举写法与未知值返回空串', () => {
      expect(normalizeStatus('Accepted')).toBe('')
      expect(normalizeStatus('Pending')).toBe('')
      expect(normalizeStatus('UNKNOWN')).toBe('')
      expect(normalizeStatus('')).toBe('')
    })
  })

  describe('isAcceptedStatus', () => {
    it('仅识别 AC', () => {
      expect(isAcceptedStatus('AC')).toBe(true)
      expect(isAcceptedStatus('Accepted')).toBe(false)
      expect(isAcceptedStatus('WA')).toBe(false)
    })
  })

  describe('isCompileErrorStatus', () => {
    it('仅识别 CE', () => {
      expect(isCompileErrorStatus('CE')).toBe(true)
      expect(isCompileErrorStatus('Compile Error')).toBe(false)
      expect(isCompileErrorStatus('WA')).toBe(false)
    })
  })

  describe('isNonFinalSubmissionStatus', () => {
    it('仅识别枚举非终态', () => {
      expect(isNonFinalSubmissionStatus('PENDING')).toBe(true)
      expect(isNonFinalSubmissionStatus('JUDGING')).toBe(true)
      expect(isNonFinalSubmissionStatus('RUNNING')).toBe(true)
      expect(isNonFinalSubmissionStatus('Pending')).toBe(false)
      expect(isNonFinalSubmissionStatus('Judging')).toBe(false)
    })

    it('应拒绝终态', () => {
      expect(isNonFinalSubmissionStatus('AC')).toBe(false)
      expect(isNonFinalSubmissionStatus('WA')).toBe(false)
    })
  })
})

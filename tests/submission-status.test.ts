/**
 * tests/submission-status.test.ts
 * 状态机单元测试（P0：canTransition 接入后的回归保护）
 */
import { describe, it, expect } from 'vitest'
import {
  SubmissionStatus,
  canTransition,
  isValidStatus,
  normalizeStatus,
} from '../lib/constants/submission-status'

describe('SubmissionStatus', () => {
  describe('枚举值', () => {
    it('应包含 14 个标准状态', () => {
      const keys = Object.keys(SubmissionStatus)
      expect(keys.length).toBeGreaterThanOrEqual(13)
      expect(SubmissionStatus.PENDING).toBe('PENDING')
      expect(SubmissionStatus.JUDGING).toBe('JUDGING')
      // 短码风格：ACCEPTED = 'AC'、WRONG_ANSWER = 'WA'、SYSTEM_ERROR = 'SE'
      expect(SubmissionStatus.ACCEPTED).toBe('AC')
      expect(SubmissionStatus.WRONG_ANSWER).toBe('WA')
      expect(SubmissionStatus.SYSTEM_ERROR).toBe('SE')
    })
  })

  describe('isValidStatus', () => {
    it('应接受标准枚举值（短码）', () => {
      expect(isValidStatus('AC')).toBe(true)
      expect(isValidStatus('WA')).toBe(true)
      expect(isValidStatus('CE')).toBe(true)
      expect(isValidStatus('SE')).toBe(true)
    })

    it('应接受历史大驼峰写法（兼容）', () => {
      expect(isValidStatus('Pending')).toBe(true)
      expect(isValidStatus('Judging')).toBe(true)
      expect(isValidStatus('Accepted')).toBe(true)
    })

    it('应拒绝非法值', () => {
      expect(isValidStatus('FOO')).toBe(false)
      expect(isValidStatus('')).toBe(false)
      expect(isValidStatus(null)).toBe(false)
      expect(isValidStatus(undefined)).toBe(false)
      expect(isValidStatus(123)).toBe(false)
    })
  })

  describe('canTransition', () => {
    it('应允许 Pending -> Judging', () => {
      expect(canTransition('PENDING', 'JUDGING')).toBe(true)
    })

    it('应允许 Judging -> Accepted (AC)', () => {
      // 枚举短码：ACCEPTED = 'AC'
      expect(canTransition('JUDGING', 'AC')).toBe(true)
    })

    it('应允许任意中间状态 -> SystemError (SE)', () => {
      expect(canTransition('JUDGING', 'SE')).toBe(true)
      expect(canTransition('PENDING', 'SE')).toBe(true)
      expect(canTransition('WA', 'SE')).toBe(true)
    })

    it('应拒绝 AC -> WA（已终态）', () => {
      expect(canTransition('AC', 'WA')).toBe(false)
    })

    it('Pending -> Accepted 不允许（必须经 Judging）', () => {
      expect(canTransition('Pending', 'AC')).toBe(false)
    })

    it('空状态应放行（recover 场景）', () => {
      expect(canTransition('', 'PENDING')).toBe(true)
    })

    it('未知非空源状态应拒绝（fail-closed）', () => {
      // 防止新增枚举值未及时维护 ALLOWED_TRANSITIONS 导致状态机失效
      expect(canTransition('UNKNOWN_STATUS', 'AC')).toBe(false)
      expect(canTransition('QUEUED', 'PENDING')).toBe(false)
    })

    it('同状态到同状态应被拒绝（终态不再自转换）', () => {
      // 终态（AC 等）只允许被 SE 覆盖；AC -> AC 不属于 canTransition 放行路径
      expect(canTransition('AC', 'AC')).toBe(false)
    })
  })

  describe('normalizeStatus', () => {
    it('应保留枚举短码不变', () => {
      // SubmissionStatus.ACCEPTED = 'AC'（短码）
      expect(normalizeStatus('AC')).toBe('AC')
      expect(normalizeStatus('WA')).toBe('WA')
      expect(normalizeStatus('CE')).toBe('CE')
      expect(normalizeStatus('SE')).toBe('SE')
      expect(normalizeStatus('TLE')).toBe('TLE')
    })

    it('应把历史大驼峰写法映射为枚举短码', () => {
      expect(normalizeStatus('Accepted')).toBe('AC')
      expect(normalizeStatus('WrongAnswer')).toBe('WA')
      expect(normalizeStatus('CompileError')).toBe('CE')
      expect(normalizeStatus('SystemError')).toBe('SE')
      expect(normalizeStatus('TimeLimitExceeded')).toBe('TLE')
    })

    it('应保留大小写转换', () => {
      expect(normalizeStatus('accepted')).toBe('AC')
      expect(normalizeStatus('ACCEPTED')).toBe('AC')
    })

    it('未知值原样返回（不抛错）', () => {
      expect(normalizeStatus('UNKNOWN')).toBe('UNKNOWN')
      expect(normalizeStatus('')).toBe('')
    })
  })
})
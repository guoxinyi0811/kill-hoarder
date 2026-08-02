import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_TIME_ZONE, torontoToday } from './today'

afterEach(() => {
  vi.useRealTimers()
})

describe('torontoToday', () => {
  it('时区固定为 America/Toronto（CLAUDE.md 核心规则 5）', () => {
    expect(APP_TIME_ZONE).toBe('America/Toronto')
  })

  it('返回 YYYY-MM-DD 格式', () => {
    expect(torontoToday(new Date('2026-08-02T15:00:00Z'))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    )
  })

  it('夏令时期间 UTC-4：UTC 03:59 仍算前一天', () => {
    // 2026-08-02T03:59Z = 多伦多 2026-08-01 23:59 EDT
    expect(torontoToday(new Date('2026-08-02T03:59:00Z'))).toBe('2026-08-01')
  })

  it('夏令时期间 UTC-4：UTC 04:00 才翻到新的一天', () => {
    // 2026-08-02T04:00Z = 多伦多 2026-08-02 00:00 EDT
    expect(torontoToday(new Date('2026-08-02T04:00:00Z'))).toBe('2026-08-02')
  })

  it('冬令时期间 UTC-5：UTC 04:59 仍算前一天', () => {
    // 2026-01-15T04:59Z = 多伦多 2026-01-14 23:59 EST
    expect(torontoToday(new Date('2026-01-15T04:59:00Z'))).toBe('2026-01-14')
  })

  it('冬令时期间 UTC-5：UTC 05:00 才翻到新的一天', () => {
    expect(torontoToday(new Date('2026-01-15T05:00:00Z'))).toBe('2026-01-15')
  })

  it('UTC 已跨年但多伦多还没跨年', () => {
    // 2027-01-01T00:30Z = 多伦多 2026-12-31 19:30 EST
    expect(torontoToday(new Date('2027-01-01T00:30:00Z'))).toBe('2026-12-31')
  })

  it('闰日：UTC 2028-03-01 早晨在多伦多仍是 2028-02-29', () => {
    expect(torontoToday(new Date('2028-03-01T04:30:00Z'))).toBe('2028-02-29')
  })

  it('月份和日号补零', () => {
    expect(torontoToday(new Date('2026-03-05T18:00:00Z'))).toBe('2026-03-05')
  })

  it('不传参时读系统时间', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-02T18:00:00Z'))
    expect(torontoToday()).toBe('2026-08-02')
  })

  it('结果与运行机器的本地时区无关（换 TZ 不改变输出）', () => {
    const instant = new Date('2026-08-02T03:59:00Z')
    const original = process.env.TZ
    try {
      process.env.TZ = 'Asia/Shanghai'
      const shanghai = torontoToday(instant)
      process.env.TZ = 'UTC'
      const utc = torontoToday(instant)
      expect(shanghai).toBe('2026-08-01')
      expect(utc).toBe('2026-08-01')
    } finally {
      process.env.TZ = original
    }
  })
})

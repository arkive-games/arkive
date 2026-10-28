import { describe, expect, it } from 'vitest'

import { serverDay } from './server'

describe('serverDay', () => {
  it('counts launch day as day 1, rolling over at 08:00 UTC+8', () => {
    expect(serverDay(new Date('2026-08-21T08:00:00+08:00'))).toBe(1)
    expect(serverDay(new Date('2026-08-22T07:59:59+08:00'))).toBe(1)
    expect(serverDay(new Date('2026-08-22T08:00:00+08:00'))).toBe(2)
    expect(serverDay(new Date('2026-10-28T07:00:00+08:00'))).toBe(68)
    expect(serverDay(new Date('2026-10-28T08:00:00+08:00'))).toBe(69)
  })

  it('does not depend on the visitor time zone', () => {
    // 2026-10-27 23:30 in New York is 2026-10-28 11:30 in China.
    expect(serverDay(new Date('2026-10-27T23:30:00-04:00'))).toBe(69)
  })
})

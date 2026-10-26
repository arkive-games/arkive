import { describe, expect, it } from 'vitest'

import { daysSinceLaunch, serverDay } from './server'

describe('serverDay', () => {
  it('counts launch day as day 1 by the local calendar date', () => {
    expect(serverDay(new Date(2026, 7, 21, 0, 1))).toBe(1)
    expect(serverDay(new Date(2026, 7, 21, 23, 59))).toBe(1)
    expect(serverDay(new Date(2026, 9, 27, 12))).toBe(68)
    expect(daysSinceLaunch(new Date(2026, 9, 27, 12))).toBe(67)
    expect(daysSinceLaunch(new Date(2026, 7, 1))).toBe(0)
  })
})

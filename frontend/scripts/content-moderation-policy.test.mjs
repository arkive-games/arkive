import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { CONTENT_POLICY } from '../apps/meta/src/moderation/model'
import copy from '../apps/meta/src/contentModerationLocale.json'

const appRequire = createRequire(new URL('../apps/aion2/package.json', import.meta.url))
const { parse } = appRequire('yaml')

describe('content moderation policy presentation', () => {
  it('uses the canonical platform thresholds without app-specific overrides', () => {
    const policy = parse(readFileSync(new URL('../../docs/ARKIVE_CONTENT_MODERATION_SPEC.yaml', import.meta.url), 'utf8'))
    expect(CONTENT_POLICY).toEqual({
      version: policy.schema_version, approvals: policy.defaults.qualifying_approvals,
      accountAgeHours: policy.defaults.minimum_account_age_hours, cleanDays: policy.defaults.violation_lookback_days,
      ordinaryViolations: policy.defaults.ordinary_violations_before_restriction,
      appealDays: policy.defaults.appeal_window_days, reviewTargetHours: policy.defaults.review_target_hours,
      overdueHours: policy.defaults.review_overdue_hours,
    })
  })
  it('provides every action and its interpolation values for each portal locale', () => {
    const keys = Object.keys(copy['en-US']).sort()
    for (const locale of ['en-US', 'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR']) {
      expect(Object.keys(copy[locale]).sort(), locale).toEqual(keys)
      for (const key of keys) {
        const placeholders = value => [...value.matchAll(/\{\{([^}]+)\}\}/g)].map(match => match[1]).sort()
        expect(placeholders(copy[locale][key]), `${locale}.${key}`).toEqual(placeholders(copy['en-US'][key]))
      }
    }
  })
})

import { ApiError } from '@gamemap/api-core'
import type { ContentUnit, ModerationGateway, QueueEntry, ReviewAuthor, ReviewCase, TrustRecord } from '../moderation/model'
import copy from './locales/moderation-preview.json'
import sampleBackdrop from '../assets/aion2-bg.jpg'
import sampleBanner from '../assets/aion2-banner.webp'

/** A development-only in-memory gateway; it imports no authentication or HTTP client. */
export function createModerationFixture(language: string, administrator: boolean, generation = 0): ModerationGateway {
  const text = copy[language as keyof typeof copy] ?? copy['en-US']
  const ago = (hours: number) => new Date(Date.now() - hours * 3600000).toISOString()
  const author = (id: string, name: string, changes: Partial<ReviewAuthor> = {}): ReviewAuthor => ({ id, name, tier: 'new', emailVerified: true, accountAgeHours: 96, qualifyingApprovals: 2, cleanHistory: true, ...changes })
  const image = { id: 'sample-one', url: sampleBackdrop, alt: 'Sample attachment using existing game artwork' }
  const second = { id: 'sample-two', url: sampleBanner, alt: 'Second sample attachment using existing game artwork' }
  const map: ContentUnit = { id: 'map-one', revision: `candidate-${2 + generation}`, type: 'map', state: 'pending', author: author('one', text.mapAuthor), games: ['aion2'], context: text.mapContext, submittedAt: ago(68), reviewReason: 'new', candidate: { title: text.mapTitle, body: text.mapBody, media: [image, second] }, canReview: true, canAwardCredit: true, audit: [] }
  const forum: ContentUnit = { ...map, id: 'forum-one', revision: 'candidate-1', type: 'forum', author: author('two', text.forumAuthor, { accountAgeHours: 32, qualifyingApprovals: 0 }), games: ['palworld'], context: text.forumContext, submittedAt: ago(26), candidate: { title: text.forumTitle, body: text.forumBody, media: [] } }
  const replacement: ContentUnit = { ...map, id: 'map-edit', revision: 'candidate-4', author: author('three', text.editAuthor, { tier: 'trusted', qualifyingApprovals: 3 }), submittedAt: ago(8), reviewReason: 'queued', candidate: { title: text.editTitle, body: text.editBody, media: [second] }, previousPublic: { title: text.editTitle, body: text.oldBody, media: [] }, canAwardCredit: false, creditExclusion: 'revision' }
  const profile: ContentUnit = { ...map, id: 'profile-one', revision: 'profile-1', type: 'profile', games: [], context: 'Arkive', author: author('four', text.profileAuthor, { emailVerified: false }), submittedAt: ago(6), reviewReason: 'unverified', candidate: { title: text.profileTitle, body: text.profileBody, media: [image] }, canAwardCredit: false, creditExclusion: 'profile' }
  const build: ContentUnit = { ...map, id: 'build-one', revision: 'build-1', type: 'build', games: ['ro3'], author: author('five', text.buildAuthor, { tier: 'restricted', cleanHistory: false }), context: text.buildContext, submittedAt: ago(2), reviewReason: 'restricted', candidate: { title: text.buildTitle, body: text.buildBody, fields: [{ label: text.buildField, value: text.buildValue }], media: [] } }
  const units = [map, forum, replacement, ...(administrator ? [profile, build] : [])]
  const caseBase = { revision: 'case-1', state: 'open' as const, createdAt: ago(4), canDecide: true }
  const cases: ReviewCase[] = [
    { ...caseBase, id: 'report-one', kind: 'reports', reason: text.reportReason, evidence: text.reportEvidence, content: { ...forum, state: 'published', canReview: false } },
    { ...caseBase, id: 'appeal-one', kind: 'appeals', reason: text.appealReason, evidence: text.appealEvidence, content: { ...map, state: 'rejected', canReview: false }, originalDecision: { action: text.rejectedAction, reason: text.originalReason, at: ago(24), appealDeadline: new Date(Date.now() + 13 * 86400000).toISOString() } },
  ]
  const people: TrustRecord[] = [
    { id: 'trust-one', revision: 'trust-1', author: map.author, ordinaryViolations: 0, seriousViolations: 0, allowedActions: ['grant', 'restrict'], audit: [] },
    { id: 'trust-five', revision: 'trust-2', author: build.author, ordinaryViolations: 2, seriousViolations: 0, allowedActions: [], holdReason: text.holdReason, recoveryAt: new Date(Date.now() + 28 * 86400000).toISOString(), audit: [{ actor: text.reviewer, action: text.rejectedAction, at: ago(48), reason: text.holdReason }] },
  ]
  return {
    policyVersion: '1.0.0', scope: { siteAdministrator: administrator, games: administrator ? ['aion2', 'palworld', 'ro3'] : ['aion2', 'palworld'] },
    list: async query => {
      let entries: QueueEntry[] = query.section === 'trust' ? (administrator ? people.map(value => ({ kind: 'trust', value })) : [])
        : query.section === 'reports' || query.section === 'appeals' ? cases.filter(item => item.kind === query.section && (query.caseState === 'open' ? item.state === 'open' : item.state !== 'open')).map(value => ({ kind: 'case', value }))
          : units.filter(unit => query.section === 'pending' ? unit.state === 'pending' : unit.state !== 'pending').map(value => ({ kind: 'content', value }))
      entries = entries.filter(entry => {
        const unit = entry.kind === 'content' ? entry.value : entry.kind === 'case' ? entry.value.content : null
        return !unit || ((query.type === 'all' || unit.type === query.type) && (query.game === 'all' || unit.games.includes(query.game)) && (query.state === 'all' || unit.state === query.state))
      })
      entries.sort((a, b) => { const at = (item: QueueEntry) => item.kind === 'content' ? item.value.submittedAt : item.kind === 'case' ? item.value.createdAt : ''; return at(a).localeCompare(at(b)) })
      return { count: entries.length, entries: structuredClone(entries.slice((query.page - 1) * query.pageSize, query.page * query.pageSize)) }
    },
    decideContent: async decision => {
      const unit = units.find(item => item.id === decision.id)
      if (!unit || unit.revision !== decision.expectedRevision || unit.state !== 'pending') throw new ApiError('ConflictError', 'The candidate changed.', 409)
      unit.state = decision.decision === 'approve' ? 'published' : 'rejected'
      unit.audit.push({ actor: text.reviewer, action: decision.decision, at: new Date().toISOString(), reason: decision.reason })
    },
    decideCase: async decision => {
      const item = cases.find(item => item.id === decision.id)
      if (!item || item.revision !== decision.expectedRevision || item.state !== 'open') throw new ApiError('ConflictError', 'The case changed.', 409)
      item.state = decision.outcome
      item.resolution = { actor: text.reviewer, at: new Date().toISOString(), reason: decision.reason }
    },
    decideTrust: async decision => {
      const item = people.find(item => item.id === decision.id)
      if (!administrator || !item || item.revision !== decision.expectedRevision || !item.allowedActions.includes(decision.action)) throw new ApiError('PermissionError', 'The decision is unavailable.', 403)
      item.author.tier = decision.action === 'restrict' ? 'restricted' : 'trusted'
      item.revision += '-next'
      item.audit.push({ actor: text.reviewer, action: decision.action, at: new Date().toISOString(), reason: decision.reason })
    },
  }
}

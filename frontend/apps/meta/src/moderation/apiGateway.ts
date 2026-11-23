import { decideModerationUnit, listModerationUnits, result, type ApiClient, type Unit } from '@gamemap/api-core'
import type { ContentState, ContentType, ModerationGateway, QueueQuery, ReviewReason } from './model'

type Client = ApiClient['client']

function asMedia(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    if (typeof item === 'string') return [{ id: `${index}`, url: item, alt: 'Submitted media' }]
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    return typeof record.url === 'string' ? [{ id: String(record.id ?? index), url: record.url, alt: typeof record.alt === 'string' ? record.alt : 'Submitted media', kind: record.kind === 'video' ? 'video' as const : 'image' as const }] : []
  })
}

function asFields(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return Object.entries(value as Record<string, unknown>).map(([label, item]) => ({ label, value: typeof item === 'string' ? item : JSON.stringify(item) }))
}

function mapUnit(unit: Unit) {
  const contentType = (['map', 'forum', 'profile', 'build'] as const).includes(unit.contentType as ContentType) ? unit.contentType as ContentType : 'map'
  const state = (['pending', 'published', 'rejected', 'hidden'] as const).includes(unit.state as ContentState) ? unit.state as ContentState : 'pending'
  const tier = (['new', 'trusted', 'restricted'] as const).includes(unit.author.tier as 'new') ? unit.author.tier as 'new' | 'trusted' | 'restricted' : 'new'
  return {
    id: unit.id, revision: String(unit.revision), type: contentType, state,
    author: { id: unit.author.id, name: unit.author.name, tier, emailVerified: unit.author.emailVerified, accountAgeHours: unit.author.accountAgeHours, qualifyingApprovals: unit.author.qualifyingApprovals, cleanHistory: unit.author.cleanHistory },
    games: unit.game ? [unit.game] : [], context: unit.sourceTable, submittedAt: unit.submittedAt,
    reviewReason: unit.reviewReason as ReviewReason,
    candidate: { title: unit.candidate.title, body: unit.candidate.body, fields: asFields(unit.candidate.fields), media: asMedia(unit.candidate.media) },
    canReview: true, canAwardCredit: contentType !== 'profile', creditExclusion: contentType === 'profile' ? 'profile' as const : undefined, audit: [],
  }
}

export function createModerationGateway(client: Client, games: string[] = [], siteAdministrator = false): ModerationGateway {
  return {
    policyVersion: '1.0.0', scope: { siteAdministrator, games },
    list: async (query: QueueQuery) => {
      if (query.section === 'reports' || query.section === 'appeals' || query.section === 'trust') return { count: 0, entries: [] }
      const response = await result(listModerationUnits({ client, throwOnError: true, query: { type: query.type === 'all' ? '' : query.type, game: query.game === 'all' ? '' : query.game, state: query.state === 'all' ? 'pending' : query.state, page: query.page, pageSize: query.pageSize } }))
      return { count: response.count, entries: (response.results ?? []).map(unit => ({ kind: 'content' as const, value: mapUnit(unit) })) }
    },
    decideContent: async decision => {
      await result(decideModerationUnit({ client, throwOnError: true, path: { id: decision.id }, body: { expectedRevision: Number(decision.expectedRevision), decision: decision.decision, classification: decision.classification, qualificationCredit: decision.qualificationCredit, reason: decision.reason, evidence: decision.evidence } }))
    },
    decideCase: async () => { throw new Error('Case decisions require the coordinated case API.') },
    decideTrust: async () => { throw new Error('Trust decisions require the coordinated trust API.') },
  }
}



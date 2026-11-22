/** UI boundary for the coordinated policy rollout; not an implemented HTTP API. */
export const CONTENT_POLICY = {
  version: '1.0.0', approvals: 3, accountAgeHours: 72, cleanDays: 30,
  ordinaryViolations: 2, appealDays: 14, reviewTargetHours: 24, overdueHours: 48,
} as const

export type PublicationTier = 'new' | 'trusted' | 'restricted'
export type ContentType = 'map' | 'forum' | 'profile' | 'build'
export type ContentState = 'pending' | 'published' | 'rejected' | 'hidden'
export type ReviewSection = 'pending' | 'history' | 'reports' | 'appeals' | 'trust' | 'rules' | 'legacy'
export type ReviewReason = 'new' | 'restricted' | 'unverified' | 'queued' | 'restoration'
export type Classification = 'quality' | 'ordinary' | 'serious'

export interface ReviewAuthor {
  id: string
  name: string
  tier: PublicationTier
  emailVerified: boolean
  accountAgeHours: number
  qualifyingApprovals: number
  cleanHistory: boolean
}

export interface ReviewMedia { id: string; url: string; alt: string; kind?: 'image' | 'video' }
export interface ContentSnapshot {
  title: string
  body: string
  media: ReviewMedia[]
  /** Profile fields and structured public build data must be inspectable. */
  fields?: { label: string; value: string }[]
}
export interface ReviewAudit { actor: string; at: string; action: string; reason: string }
export interface ContentUnit {
  id: string
  revision: string
  type: ContentType
  state: ContentState
  author: ReviewAuthor
  games: string[]
  context: string
  submittedAt: string
  reviewReason: ReviewReason
  candidate: ContentSnapshot
  previousPublic?: ContentSnapshot
  canReview: boolean
  /** The server excludes self-review, edits, profiles and duplicate credits. */
  canAwardCredit: boolean
  creditExclusion?: 'self' | 'profile' | 'revision' | 'duplicate'
  audit: ReviewAudit[]
}
export interface ReviewCase {
  id: string
  revision: string
  kind: 'reports' | 'appeals'
  state: 'open' | 'upheld' | 'dismissed' | 'overturned'
  createdAt: string
  reason: string
  evidence: string
  originalDecision?: { action: string; reason: string; at: string; appealDeadline: string }
  resolution?: { actor: string; at: string; reason: string }
  content: ContentUnit
  canDecide: boolean
}
export interface TrustRecord {
  id: string
  revision: string
  author: ReviewAuthor
  ordinaryViolations: number
  seriousViolations: number
  holdReason?: string
  recoveryAt?: string
  allowedActions: ('grant' | 'restrict' | 'restore')[]
  audit: ReviewAudit[]
}
export interface QueueQuery {
  section: 'pending' | 'history' | 'reports' | 'appeals' | 'trust'
  type: ContentType | 'all'
  game: string
  state: ContentState | 'all'
  caseState: 'open' | 'closed'
  page: number
  pageSize: number
  order: 'oldest'
}
export type QueueEntry =
  | { kind: 'content'; value: ContentUnit }
  | { kind: 'case'; value: ReviewCase }
  | { kind: 'trust'; value: TrustRecord }
export interface QueueResult { count: number; entries: QueueEntry[] }
export interface ContentDecision {
  id: string
  expectedRevision: string
  decision: 'approve' | 'reject'
  qualificationCredit: boolean
  classification: Classification
  reason: string
  evidence: string
}
export interface CaseDecision { id: string; expectedRevision: string; outcome: 'upheld' | 'dismissed' | 'overturned'; reason: string }
export interface TrustDecision { id: string; expectedRevision: string; action: 'grant' | 'restrict' | 'restore'; reason: string }

/**
 * Supply only after every public channel implements the canonical policy.
 * Each operation must enforce authorization and exact revision on the server.
 * Never adapt legacy per-image writes into a whole-unit approval.
 */
export interface ModerationGateway {
  policyVersion: typeof CONTENT_POLICY.version
  scope: { siteAdministrator: boolean; games: string[] }
  list: (query: QueueQuery) => Promise<QueueResult>
  decideContent: (decision: ContentDecision) => Promise<void>
  decideCase: (decision: CaseDecision) => Promise<void>
  decideTrust: (decision: TrustDecision) => Promise<void>
}

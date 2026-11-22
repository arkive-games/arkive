import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, cn, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@gamemap/ui'
import { IconCheck, IconExternalLink, IconPhotoOff, IconRefresh, IconX } from '@tabler/icons-react'
import { CONTENT_POLICY, type Classification, type ContentSnapshot, type ContentUnit, type ModerationGateway, type QueueEntry, type ReviewAudit, type ReviewAuthor, type ReviewCase, type ReviewMedia, type TrustRecord } from './model'
import { TierBadge, useModerationCopy } from './shared'

function useReviewDate() {
  const { i18n } = useTranslation()
  const format = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: 'medium', timeStyle: 'short' })
  return (value: string) => format.format(new Date(value))
}

function MediaPreview({ media, onReady }: { media: ReviewMedia; onReady?: (id: string, ready: boolean) => void }) {
  const m = useModerationCopy()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  return <figure className="min-w-0">
    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[var(--arkive-radius-media)] bg-muted">
      {status === 'error' ? <div role="alert" className="space-y-2 p-4 text-center"><IconPhotoOff className="mx-auto size-6 text-muted-foreground" stroke={1.8} aria-hidden="true" /><p className="text-xs">{m('imageFailed')}</p><Button variant="outline" className="min-h-11 rounded-full" onClick={() => { setStatus('loading'); setAttempt(value => value + 1); onReady?.(media.id, false) }}>{m('imageRetry')}</Button></div>
        : <>{media.kind === 'video' ? <video key={attempt} src={media.url} controls preload="auto" aria-label={media.alt} className="size-full object-contain" onLoadedData={() => { setStatus('ready'); onReady?.(media.id, true) }} onError={() => { setStatus('error'); onReady?.(media.id, false) }} /> : <img key={attempt} src={media.url} alt={media.alt} className={cn('size-full object-contain', status !== 'ready' && 'opacity-0')} onLoad={() => { setStatus('ready'); onReady?.(media.id, true) }} onError={() => { setStatus('error'); onReady?.(media.id, false) }} />}{status === 'loading' ? <span role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground"><IconRefresh className="size-4 motion-safe:animate-spin" aria-hidden="true" />{m('imageLoading')}</span> : null}</>}
    </div>
    <a href={media.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><IconExternalLink className="size-3.5" stroke={1.8} aria-hidden="true" />{m(media.kind === 'video' ? 'fullMedia' : 'fullImage')}</a>
  </figure>
}

function Snapshot({ snapshot, onMediaReady }: { snapshot: ContentSnapshot; onMediaReady?: (id: string, ready: boolean) => void }) {
  return <div className="min-w-0 space-y-4">
    <h3 className="break-words text-base font-semibold">{snapshot.title}</h3>
    {snapshot.body ? <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{snapshot.body}</p> : null}
    {snapshot.fields?.length ? <dl className="space-y-3">{snapshot.fields.map((field, index) => <div key={index}><dt className="text-xs text-muted-foreground">{field.label}</dt><dd className="mt-1 whitespace-pre-wrap break-all text-sm">{field.value}</dd></div>)}</dl> : null}
    {snapshot.media.length ? <div className={cn('grid min-w-0 gap-4', snapshot.media.length > 1 && 'sm:grid-cols-2')}>{snapshot.media.map(media => <MediaPreview key={`${media.id}:${media.url}`} media={media} onReady={onMediaReady} />)}</div> : null}
  </div>
}

export function AuthorEligibility({ author }: { author: ReviewAuthor }) {
  const m = useModerationCopy()
  return <section aria-label={m('eligibility')} className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center gap-2"><h3 className="break-words text-sm font-semibold">{author.name}</h3><TierBadge author={author} /></div>
    <dl className="space-y-3 text-xs">
      <div><dt className="text-muted-foreground">{m('accountAge')}</dt><dd className="mt-1 tabular-nums">{m('hours', { count: Math.floor(author.accountAgeHours) })}</dd></div>
      <div><dt className="text-muted-foreground">{m('credits')}</dt><dd className="mt-1 tabular-nums">{m('creditProgress', { count: author.qualifyingApprovals, required: CONTENT_POLICY.approvals })}</dd></div>
      <div className="flex items-start gap-2">{author.emailVerified ? <IconCheck className="size-4 shrink-0" aria-hidden="true" /> : <IconX className="size-4 shrink-0" aria-hidden="true" />}<span>{m(author.emailVerified ? 'verified' : 'unverified')}</span></div>
      <div className="flex items-start gap-2">{author.cleanHistory ? <IconCheck className="size-4 shrink-0" aria-hidden="true" /> : <IconX className="size-4 shrink-0" aria-hidden="true" />}<span>{m(author.cleanHistory ? 'clean' : 'notClean')}</span></div>
    </dl>
  </section>
}

function AuditTrail({ records }: { records: ReviewAudit[] }) {
  const m = useModerationCopy()
  const date = useReviewDate()
  return <details className="border-t border-border pt-4"><summary className="cursor-pointer text-sm font-medium">{m('audit')}</summary>{records.length ? <ol className="mt-3 space-y-3">{records.map((record, index) => <li key={index} className="space-y-1 text-xs"><p className="flex flex-wrap gap-x-2"><span>{record.actor}</span><span>{record.action}</span><time className="text-muted-foreground" dateTime={record.at}>{date(record.at)}</time></p><p className="whitespace-pre-wrap break-words text-muted-foreground">{record.reason}</p></li>)}</ol> : <p className="mt-3 text-xs text-muted-foreground">{m('noAudit')}</p>}</details>
}

function ContentBody({ unit, onMediaReady }: { unit: ContentUnit; onMediaReady?: (id: string, ready: boolean) => void }) {
  const m = useModerationCopy()
  const date = useReviewDate()
  return <>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground"><span className="rounded-full bg-muted px-3 py-1 font-medium text-foreground">{m(unit.state)}</span><span>{m(`${unit.reviewReason}Reason`)}</span><time dateTime={unit.submittedAt}>{date(unit.submittedAt)}</time></div>
    <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1fr)_12rem]">
      <div className="min-w-0 space-y-4"><Snapshot snapshot={unit.candidate} onMediaReady={onMediaReady} />
        {unit.previousPublic ? <details className="border-t border-border pt-4"><summary className="cursor-pointer text-sm font-medium">{m('previousPublic')}</summary><p className="my-3 text-xs leading-relaxed text-muted-foreground">{m('replacement')}</p><Snapshot snapshot={unit.previousPublic} /></details> : null}
      </div>
      <aside className="min-w-0 space-y-6 border-t border-border pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-4"><AuthorEligibility author={unit.author} /><dl className="space-y-3 text-xs"><div><dt className="text-muted-foreground">{m('context')}</dt><dd className="mt-1 break-words leading-relaxed">{unit.context}</dd></div><div><dt className="text-muted-foreground">{m('revision')}</dt><dd className="mt-1 break-all font-mono">{unit.revision}</dd></div></dl></aside>
    </div>
  </>
}

function ReasonField({ value, onChange, evidence = false, disabled, id }: { value: string; onChange: (value: string) => void; evidence?: boolean; disabled: boolean; id: string }) {
  const m = useModerationCopy()
  return <label htmlFor={id} className="block space-y-2 text-sm"><span className="font-medium">{m(evidence ? 'evidence' : 'reason')}</span><textarea id={id} required value={value} disabled={disabled} onChange={event => onChange(event.target.value)} placeholder={m(evidence ? 'evidencePlaceholder' : 'reasonPlaceholder')} className="min-h-24 w-full rounded-[var(--arkive-radius-standard)] border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50" /></label>
}

function ContentReview({ unit, gateway, disabled, busy, onSave }: { unit: ContentUnit } & DetailActions) {
  const m = useModerationCopy()
  const [readyMedia, setReadyMedia] = useState<Record<string, boolean>>({})
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)
  const [credit, setCredit] = useState(unit.canAwardCredit)
  const [classification, setClassification] = useState<Classification>('quality')
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState('')
  const [validation, setValidation] = useState<string | null>(null)
  const previewsReady = unit.candidate.media.every(media => readyMedia[media.id])
  const canDecide = unit.canReview && unit.state === 'pending'
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canDecide || !action || disabled || (action === 'approve' && !previewsReady)) return
    if ((action === 'reject' || (unit.canAwardCredit && !credit)) && !reason.trim()) { setValidation(action === 'approve' ? 'noCreditReason' : 'reasonRequired'); return }
    if (action === 'reject' && classification !== 'quality' && !evidence.trim()) { setValidation('evidenceRequired'); return }
    setValidation(null)
    void onSave(() => gateway.decideContent({ id: unit.id, expectedRevision: unit.revision, decision: action, qualificationCredit: action === 'approve' && unit.canAwardCredit && credit, classification: action === 'reject' ? classification : 'quality', reason: reason.trim(), evidence: action === 'reject' && classification !== 'quality' ? evidence.trim() : '' }))
  }
  const exclusion = { self: 'self', profile: 'profileExcluded', revision: 'revisionExcluded', duplicate: 'duplicateExcluded' }
  return <article className="min-w-0 space-y-6" data-testid="content-review-detail">
    <ContentBody unit={unit} onMediaReady={(id, ready) => setReadyMedia(values => ({ ...values, [id]: ready }))} />
    <AuditTrail records={unit.audit} />
    {!canDecide ? <p className="text-xs text-muted-foreground">{m('readOnly')}</p> : <form onSubmit={submit} noValidate className="space-y-4 border-t border-border pt-4">
      <p className="text-xs text-muted-foreground">{m('wholeUnit')}</p>
      {action === 'approve' ? <div className="space-y-4">
        {unit.canAwardCredit ? <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={credit} disabled={disabled} onChange={event => setCredit(event.target.checked)} className="size-4 shrink-0 accent-primary" />{m('credit')}</label> : <p className="text-xs text-muted-foreground">{m(unit.creditExclusion ? exclusion[unit.creditExclusion] : 'creditExcluded')}</p>}
        {unit.canAwardCredit && !credit ? <ReasonField id="approval-reason" value={reason} onChange={setReason} disabled={disabled} /> : null}
      </div> : null}
      {action === 'reject' ? <div className="space-y-4">
        <div className="space-y-2"><label htmlFor="decision-classification" className="text-sm font-medium">{m('classification')}</label><Select value={classification} onValueChange={value => setClassification(value as Classification)} disabled={disabled}><SelectTrigger id="decision-classification" className="min-h-11 max-w-full rounded-full"><SelectValue /></SelectTrigger><SelectContent className="z-[var(--arkive-layer-nested-overlay)]">{(['quality', 'ordinary', 'serious'] as const).map(value => <SelectItem key={value} value={value}>{m(value)}</SelectItem>)}</SelectContent></Select><p className="text-xs leading-relaxed text-muted-foreground">{m(classification === 'quality' ? 'qualityHint' : 'violationHint')}</p></div>
        <ReasonField id="rejection-reason" value={reason} onChange={setReason} disabled={disabled} />
        {classification !== 'quality' ? <ReasonField id="violation-evidence" value={evidence} onChange={setEvidence} evidence disabled={disabled} /> : null}
      </div> : null}
      {validation ? <p role="alert" className="text-sm text-destructive">{m(validation)}</p> : null}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {action ? <><Button type="button" variant="outline" className="min-h-11 rounded-full" disabled={disabled} onClick={() => { setAction(null); setValidation(null) }}>{m('cancel')}</Button><Button type="submit" className="arkive-dialog-primary min-h-11 rounded-full" disabled={disabled || (action === 'approve' && !previewsReady)}>{m(busy ? 'saving' : action === 'approve' ? 'confirmApprove' : 'confirmReject')}</Button></>
          : <><Button type="button" variant="outline" className="min-h-11 rounded-full" disabled={disabled} onClick={() => setAction('reject')}><IconX className="size-4" aria-hidden="true" />{m('reject')}</Button><Button type="button" className="arkive-dialog-primary min-h-11 rounded-full" disabled={disabled || !previewsReady} onClick={() => setAction('approve')}><IconCheck className="size-4" aria-hidden="true" />{m('approve')}</Button></>}
      </div>
    </form>}
  </article>
}

function CaseReview({ item, gateway, disabled, busy, onSave }: { item: ReviewCase } & DetailActions) {
  const m = useModerationCopy()
  const date = useReviewDate()
  const [outcome, setOutcome] = useState<'upheld' | 'dismissed' | 'overturned'>('upheld')
  const [reason, setReason] = useState('')
  const [validation, setValidation] = useState(false)
  const [readyMedia, setReadyMedia] = useState<Record<string, boolean>>({})
  const requiresPreviews = item.kind === 'appeals' && outcome === 'overturned'
  const previewsReady = item.content.candidate.media.every(media => readyMedia[media.id])
  return <article className="min-w-0 space-y-6" data-testid="case-review-detail">
    <dl className="space-y-3 text-sm"><div><dt className="font-semibold">{m('caseReason')}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{item.reason}</dd></div>{item.evidence ? <div><dt className="font-semibold">{m('evidence')}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{item.evidence}</dd></div> : null}
      {item.originalDecision ? <div><dt className="font-semibold">{m('originalDecision')}</dt><dd className="mt-1 space-y-2"><p>{item.originalDecision.action} · {item.originalDecision.reason}</p><time className="block text-xs text-muted-foreground" dateTime={item.originalDecision.at}>{date(item.originalDecision.at)}</time><p className="text-xs">{m('appealDeadline')} · <time dateTime={item.originalDecision.appealDeadline}>{date(item.originalDecision.appealDeadline)}</time></p></dd></div> : null}
    </dl>
    {item.resolution ? <div className="space-y-2 border-t border-border pt-4 text-sm"><h3 className="font-semibold">{m('audit')}</h3><p>{item.resolution.actor} · {m(item.kind === 'reports' && item.state === 'upheld' ? 'reportUpheld' : item.state)}</p><time dateTime={item.resolution.at} className="block text-xs text-muted-foreground">{date(item.resolution.at)}</time><p className="whitespace-pre-wrap break-words">{item.resolution.reason}</p></div> : null}
    <ContentBody unit={item.content} onMediaReady={(id, ready) => setReadyMedia(values => ({ ...values, [id]: ready }))} />
    {item.canDecide && item.state === 'open' ? <form noValidate className="space-y-4 border-t border-border pt-4" onSubmit={event => {
      event.preventDefault(); if (disabled || (requiresPreviews && !previewsReady)) return; if (!reason.trim()) { setValidation(true); return }
      void onSave(() => gateway.decideCase({ id: item.id, expectedRevision: item.revision, outcome, reason: reason.trim() }))
    }}>
      <p className="text-xs leading-relaxed text-muted-foreground">{m(item.kind === 'reports' ? 'reportHint' : 'appealHint')}</p>
      <Select value={outcome} onValueChange={value => setOutcome(value as typeof outcome)} disabled={disabled}><SelectTrigger className="min-h-11 rounded-full" aria-label={m('status')}><SelectValue /></SelectTrigger><SelectContent className="z-[var(--arkive-layer-nested-overlay)]"><SelectItem value="upheld">{m(item.kind === 'reports' ? 'reportUpheld' : 'upheld')}</SelectItem><SelectItem value={item.kind === 'reports' ? 'dismissed' : 'overturned'}>{m(item.kind === 'reports' ? 'dismissed' : 'overturned')}</SelectItem></SelectContent></Select>
      <ReasonField id="case-decision-reason" value={reason} onChange={setReason} disabled={disabled} />
      {validation ? <p role="alert" className="text-sm text-destructive">{m('reasonRequired')}</p> : null}
      <div className="flex justify-end"><Button type="submit" className="arkive-dialog-primary min-h-11 rounded-full" disabled={disabled || (requiresPreviews && !previewsReady)}>{m(busy ? 'saving' : 'confirmDecision')}</Button></div>
    </form> : <p className="text-xs text-muted-foreground">{m('readOnly')}</p>}
  </article>
}

function TrustReview({ record, gateway, disabled, busy, onSave }: { record: TrustRecord } & DetailActions) {
  const m = useModerationCopy()
  const date = useReviewDate()
  const [action, setAction] = useState(record.allowedActions[0])
  const [reason, setReason] = useState('')
  const [validation, setValidation] = useState(false)
  return <article className="space-y-6" data-testid="trust-review-detail">
    <AuthorEligibility author={record.author} />
    <dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">{m('ordinaryCount')}</dt><dd className="mt-1 tabular-nums">{record.ordinaryViolations}</dd></div><div><dt className="text-xs text-muted-foreground">{m('seriousCount')}</dt><dd className="mt-1 tabular-nums">{record.seriousViolations}</dd></div>{record.holdReason ? <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">{m('hold')}</dt><dd className="mt-1 break-words">{record.holdReason}</dd></div> : null}{record.recoveryAt ? <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">{m('recovery')}</dt><dd className="mt-1"><time dateTime={record.recoveryAt}>{date(record.recoveryAt)}</time></dd></div> : null}</dl>
    <AuditTrail records={record.audit} />
    {gateway.scope.siteAdministrator && record.allowedActions.length ? <form noValidate className="space-y-4 border-t border-border pt-4" onSubmit={event => {
      event.preventDefault(); if (disabled || !record.allowedActions.includes(action)) return
      if (!reason.trim()) { setValidation(true); return }
      void onSave(() => gateway.decideTrust({ id: record.id, expectedRevision: record.revision, action, reason: reason.trim() }))
    }}><Select value={action} onValueChange={value => setAction(value as typeof action)} disabled={disabled}><SelectTrigger className="min-h-11 rounded-full" aria-label={m('trust')}><SelectValue /></SelectTrigger><SelectContent className="z-[var(--arkive-layer-nested-overlay)]">{record.allowedActions.map(value => <SelectItem value={value} key={value}>{m(value)}</SelectItem>)}</SelectContent></Select><ReasonField id="trust-decision-reason" value={reason} onChange={setReason} disabled={disabled} />{validation ? <p role="alert" className="text-sm text-destructive">{m('reasonRequired')}</p> : null}<div className="flex justify-end"><Button type="submit" className="arkive-dialog-primary min-h-11 rounded-full" disabled={disabled}>{m(busy ? 'saving' : 'confirmTrust')}</Button></div></form> : <p className="text-xs text-muted-foreground">{m('readOnly')}</p>}
  </article>
}

interface DetailActions { gateway: ModerationGateway; disabled: boolean; busy: boolean; onSave: (operation: () => Promise<void>) => Promise<void> }
export function ReviewDetail({ entry, ...actions }: { entry: QueueEntry } & DetailActions) {
  if (entry.kind === 'content') return <ContentReview unit={entry.value} {...actions} />
  if (entry.kind === 'case') return <CaseReview item={entry.value} {...actions} />
  return <TrustReview record={entry.value} {...actions} />
}

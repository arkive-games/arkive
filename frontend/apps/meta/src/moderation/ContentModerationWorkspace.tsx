import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@gamemap/api-core'
import { ArkiveEncyclopediaWorkspace } from '@gamemap/map-shell'
import { Button, CatalogFacetOption, CatalogFacetTrack, cn, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, PageSkeleton, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@gamemap/ui'
import { IconArrowLeft, IconBook2, IconChevronLeft, IconChevronRight, IconClock, IconFlag, IconHistory, IconListCheck, IconMapPin, IconMessage2, IconPhoto, IconRefresh, IconTools, IconUserCircle, IconUserShield } from '@tabler/icons-react'
import { CONTENT_POLICY, type ContentState, type ContentType, type ModerationGateway, type QueueEntry, type QueueQuery, type ReviewSection } from './model'
import { ReviewDetail } from './ReviewDetail'
import { TierBadge, useModerationCopy } from './shared'

const PAGE_SIZE = 20
const typeIcons = { map: IconMapPin, forum: IconMessage2, profile: IconUserCircle, build: IconTools }
const sectionIcons = { pending: IconListCheck, history: IconHistory, reports: IconFlag, appeals: IconMessage2, trust: IconUserShield, rules: IconBook2, legacy: IconPhoto }
const contentTypes: (ContentType | 'all')[] = ['all', 'map', 'forum', 'profile', 'build']

export function PublicationRules() {
  const m = useModerationCopy()
  const rules = [
    ['promotionTitle', 'promotion', { hours: CONTENT_POLICY.accountAgeHours, count: CONTENT_POLICY.approvals, days: CONTENT_POLICY.cleanDays }],
    ['unitTitle', 'unitRule', {}],
    ['restrictionTitle', 'restriction', { count: CONTENT_POLICY.ordinaryViolations, days: CONTENT_POLICY.cleanDays }],
    ['appealTitle', 'appealRule', { days: CONTENT_POLICY.appealDays }],
    ['timingTitle', 'timingRule', { target: CONTENT_POLICY.reviewTargetHours, overdue: CONTENT_POLICY.overdueHours }],
    ['authorityTitle', 'authorityRule', {}],
  ] as const
  return <section data-testid="publication-rules" className="max-w-prose">
    <h2 className="text-base font-semibold">{m('rulesTitle')}</h2>
    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m('rulesScope')}</p>
    <dl className="mt-6 divide-y divide-border">{rules.map(([title, text, values]) => <div key={title} className="py-4 first:pt-0">
      <dt className="text-sm font-semibold">{m(title)}</dt><dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{m(text, values)}</dd>
    </div>)}</dl>
  </section>
}

/** Real UI shared by the protected route and its development-only fixture. */
export function ContentModerationWorkspace({ gateway, siteAdministrator, legacy, initialSection = 'pending' }: {
  gateway: ModerationGateway | null; siteAdministrator: boolean; legacy?: ReactNode; initialSection?: ReviewSection;
}) {
  const m = useModerationCopy()
  const [collapsed, setCollapsed] = useState(false)
  const [section, setSection] = useState<ReviewSection>(initialSection)
  const [type, setType] = useState<ContentType | 'all'>('all')
  const [game, setGame] = useState('all')
  const [state, setState] = useState<ContentState | 'all'>('all')
  const [caseState, setCaseState] = useState<'open' | 'closed'>('open')
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [entries, setEntries] = useState<QueueEntry[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState<'loadFailed' | 'saveFailed' | 'conflict' | null>(null)
  const [denied, setDenied] = useState(false)
  const [selected, setSelected] = useState<QueueEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(false)
  const [now, setNow] = useState(Date.now)
  const focusOrigin = useRef<HTMLButtonElement | null>(null)
  const queueRef = useRef<HTMLElement | null>(null)
  const writeLock = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer) }, [])
  const readyGateway = gateway?.policyVersion === CONTENT_POLICY.version ? gateway : null
  const canManageTrust = siteAdministrator && Boolean(readyGateway?.scope.siteAdministrator)
  const queueSection = section !== 'rules' && section !== 'legacy'
  const query = useMemo<QueueQuery | null>(() => !queueSection ? null : ({
    section, type: section === 'trust' ? 'all' : type, game: section === 'trust' ? 'all' : game,
    state: section === 'pending' ? 'pending' : section === 'history' ? state : 'all', caseState, page, pageSize: PAGE_SIZE, order: 'oldest',
  }), [section, queueSection, type, game, state, caseState, page])

  useEffect(() => {
    if (!readyGateway || !query || denied || (query.section === 'trust' && !canManageTrust)) return
    let active = true
    setLoading(true)
    setFailure(null)
    void readyGateway.list(query).then(data => {
      if (!active) return
      const lastPage = Math.max(1, Math.ceil(data.count / PAGE_SIZE))
      if (page > lastPage) { setPage(lastPage); return }
      setEntries(data.entries)
      setCount(data.count)
    }).catch((error: unknown) => {
      if (!active) return
      setEntries([])
      setCount(0)
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) { setDenied(true); setSelected(null) }
      else setFailure('loadFailed')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [readyGateway, query, refresh, denied, canManageTrust, page])

  const changeFilter = (change: () => void) => {
    if (writeLock.current) return
    change(); setPage(1); setEntries([]); setCount(0); setSelected(null); setNotice(false); setFailure(null)
  }
  const navigate = (next: ReviewSection) => changeFilter(() => setSection(next))
  const changePage = (next: number) => { if (!writeLock.current) { setEntries([]); setSelected(null); setNotice(false); setPage(next) } }
  const save = async (operation: () => Promise<void>) => {
    if (writeLock.current || denied || !readyGateway || failure === 'conflict') return
    writeLock.current = true
    setBusy(true); setFailure(null); setNotice(false)
    try {
      await operation()
      if (!mounted.current) return
      setSelected(null); setEntries([]); setNotice(true); setRefresh(value => value + 1)
    } catch (error) {
      if (!mounted.current) return
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setDenied(true); setEntries([]); setCount(0); setSelected(null)
      } else setFailure(error instanceof ApiError && error.status === 409 ? 'conflict' : 'saveFailed')
    } finally { writeLock.current = false; if (mounted.current) setBusy(false) }
  }
  const entry = (key: ReviewSection) => { const Icon = sectionIcons[key]; return { key, label: m(key), icon: <Icon className="size-5" stroke={1.8} aria-hidden="true" /> } }
  const groups = [
    { key: 'work', label: m('work'), entries: ['pending', 'history', 'reports', 'appeals'].map(key => entry(key as ReviewSection)) },
    { key: 'management', label: m('management'), entries: [...(siteAdministrator ? [entry('trust')] : []), entry('rules'), ...(legacy ? [entry('legacy')] : [])] },
  ]
  const { t, i18n } = useTranslation()
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: 'medium', timeStyle: 'short' }), [i18n.resolvedLanguage, i18n.language])
  const gameName = (key: string) => t(`site.${key}.name`, { defaultValue: key })
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const reload = () => { setSelected(null); setEntries([]); setFailure(null); setRefresh(value => value + 1) }

  return <main className="arkive-content-page mx-auto w-full max-w-[var(--arkive-content-wide-data)] flex-1 px-[var(--arkive-page-gutter)] pb-12" data-testid="content-moderation-page">
    <h1 className="sr-only">{m('title')}</h1>
    <div className="mb-4 lg:hidden"><Select value={section} onValueChange={value => navigate(value as ReviewSection)} disabled={busy}><SelectTrigger className="min-h-11 w-full rounded-full" aria-label={m('section')}><SelectValue /></SelectTrigger><SelectContent>{groups.flatMap(group => group.entries).map(item => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectContent></Select></div>
    <ArkiveEncyclopediaWorkspace groups={groups} active={section} label={m('title')} collapsed={collapsed} onCollapsedChange={setCollapsed} collapseLabel={m('collapse')} expandLabel={m('expand')}
      renderLink={(item, className, children) => <button type="button" className={cn(className, 'w-full text-left')} aria-current={section === item.key ? 'page' : undefined} disabled={busy} onClick={() => navigate(item.key as ReviewSection)}>{children}</button>}
      railFooter={<a href="#account/edit" className="mt-6 inline-flex min-h-11 items-center gap-2 px-2 text-xs text-muted-foreground hover:text-foreground"><IconArrowLeft className="size-4" aria-hidden="true" stroke={1.8} />{m('back')}</a>}>
      {denied ? <p role="alert" className="py-12 text-sm">{m('forbidden')}</p>
        : section === 'rules' ? <PublicationRules />
          : section === 'legacy' ? legacy
            : <section ref={queueRef} tabIndex={-1} aria-label={m(section)} aria-busy={loading || busy} className="min-w-0 focus-visible:outline-2 focus-visible:outline-ring" data-testid="content-review-queue">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3" data-testid="content-review-toolbar">
                {section !== 'trust' ? <div role="group" aria-label={m('all')}><CatalogFacetTrack>
                  {contentTypes.filter(key => siteAdministrator || key !== 'profile').map(key => <CatalogFacetOption key={key} inline active={type === key} label={m(key)} onClick={() => changeFilter(() => setType(key))} />)}
                </CatalogFacetTrack></div> : <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{m('trustHint')}</p>}
                <div className="flex min-h-[var(--arkive-catalog-control-height)] max-w-full flex-wrap items-center gap-2">
                  {section !== 'trust' ? <Select value={game} onValueChange={value => changeFilter(() => setGame(value))} disabled={busy || !readyGateway}><SelectTrigger className="min-h-11 max-w-full rounded-full" aria-label={m('game')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{m('allGames')}</SelectItem>{readyGateway?.scope.games.map(key => <SelectItem key={key} value={key}>{gameName(key)}</SelectItem>)}</SelectContent></Select> : null}
                  {section === 'history' ? <Select value={state} onValueChange={value => changeFilter(() => setState(value as ContentState | 'all'))} disabled={busy || !readyGateway}><SelectTrigger className="min-h-11 rounded-full" aria-label={m('status')}><SelectValue /></SelectTrigger><SelectContent>{(['all', 'published', 'rejected', 'hidden'] as const).map(value => <SelectItem value={value} key={value}>{m(value === 'all' ? 'allStates' : value)}</SelectItem>)}</SelectContent></Select> : null}
                  {section === 'reports' || section === 'appeals' ? <Select value={caseState} onValueChange={value => changeFilter(() => setCaseState(value as 'open' | 'closed'))} disabled={busy || !readyGateway}><SelectTrigger className="min-h-11 rounded-full" aria-label={m('status')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">{m('open')}</SelectItem><SelectItem value="closed">{m('closed')}</SelectItem></SelectContent></Select> : null}
                  <Button variant="ghost" className="min-h-11 rounded-full" disabled={loading || busy || !readyGateway} onClick={reload}><IconRefresh className={cn('size-4', loading && 'motion-safe:animate-spin')} stroke={1.8} aria-hidden="true" />{m('refresh')}</Button>
                </div>
              </div>
              {notice ? <p role="status" className="mb-4 text-sm">{m('saved')}</p> : null}
              {!readyGateway ? <div className="max-w-prose py-12" data-testid="moderation-integration-pending"><IconListCheck className="mb-4 size-8 text-muted-foreground" stroke={1.5} aria-hidden="true" /><p className="text-sm font-medium">{m('integrationTitle')}</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m('integrationBody')}</p>{legacy ? <Button variant="outline" className="mt-4 min-h-11 rounded-full" onClick={() => navigate('legacy')}>{m('legacy')}</Button> : null}</div>
                : section === 'trust' && !canManageTrust ? <p role="alert" className="py-12 text-sm">{m('forbidden')}</p>
                  : <>
                    {failure && !selected ? <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 text-sm"><p className="text-destructive">{m(failure)}</p><Button variant="outline" className="min-h-11 rounded-full" onClick={reload}>{m('retry')}</Button></div> : null}
                    {loading && !entries.length ? <div className="min-h-80"><PageSkeleton label={m('loading')} /></div> : null}
                    {!loading && !failure && !entries.length ? <div className="py-12 text-center" data-testid="content-review-empty"><p className="text-sm">{m('empty')}</p><p className="mx-auto mt-2 max-w-prose text-xs leading-relaxed text-muted-foreground">{m('emptyScope')}</p></div> : null}
                    {entries.length ? <ul className="divide-y divide-border" aria-label={m(section)}>{entries.map(item => {
                      const value = item.value
                      const unit = item.kind === 'content' ? item.value : item.kind === 'case' ? item.value.content : null
                      const author = item.kind === 'trust' ? item.value.author : unit!.author
                      const title = unit?.candidate.title || author.name
                      const media = unit?.candidate.media[0]
                      const Icon = unit ? typeIcons[unit.type] : IconUserShield
                      const date = item.kind === 'case' ? item.value.createdAt : unit?.submittedAt
                      const overdue = section === 'pending' && date && now - new Date(date).getTime() > CONTENT_POLICY.overdueHours * 3600000
                      const statusLabel = item.kind === 'case' ? m(item.value.kind === 'reports' && item.value.state === 'upheld' ? 'reportUpheld' : item.value.state) : unit ? m(unit.state) : m(author.tier)
                      return <li key={value.id} data-testid="content-review-row"><button type="button" aria-haspopup="dialog" aria-label={m('choose', { title })} disabled={busy || loading} onClick={event => { focusOrigin.current = event.currentTarget; setFailure(null); setSelected(item) }}
                        className="grid w-full grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 sm:grid-cols-[4rem_minmax(0,1fr)_minmax(8rem,0.5fr)_auto] sm:gap-4">
                        {media ? <img src={media.url} alt="" className="aspect-square w-full rounded-[var(--arkive-radius-standard)] bg-muted object-cover" loading="lazy" /> : <span className="grid aspect-square w-full place-items-center rounded-[var(--arkive-radius-standard)] bg-muted"><Icon className="size-6 text-muted-foreground" stroke={1.5} aria-hidden="true" /></span>}
                        <span className="min-w-0"><span className="block break-words text-sm font-semibold">{title}</span>{unit ? <span className="mt-1 line-clamp-1 break-all text-xs text-muted-foreground">{unit.candidate.body || unit.context}</span> : null}<span className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span>{author.name}</span><TierBadge author={author} /><span className="text-muted-foreground">{unit ? m(unit.type) : m('trust')}{unit?.games.length ? ` · ${unit.games.map(gameName).join(' / ')}` : ''}</span></span>{date ? <span className="mt-2 block space-y-1 text-xs sm:hidden"><span className="block text-muted-foreground">{statusLabel} · <time dateTime={date}>{dateFormat.format(new Date(date))}</time></span>{overdue ? <span className="inline-flex items-center gap-1"><IconClock className="size-3.5" stroke={1.8} aria-hidden="true" />{m('overdue')}</span> : null}</span> : null}</span>
                        <span className="hidden min-w-0 space-y-2 text-xs sm:block"><span className="block text-muted-foreground">{statusLabel}</span>{date ? <time className="block text-muted-foreground" dateTime={date}>{dateFormat.format(new Date(date))}</time> : null}{overdue ? <span className="inline-flex items-center gap-1 font-medium"><IconClock className="size-3.5" stroke={1.8} aria-hidden="true" />{m('overdue')}</span> : null}</span>
                        <IconChevronRight className="size-4 text-muted-foreground" stroke={1.8} aria-hidden="true" />
                      </button></li>
                    })}</ul> : null}
                    {count > PAGE_SIZE ? <nav className="mt-8 flex flex-wrap items-center justify-center gap-3" aria-label={m('pages')}><Button variant="outline" className="size-11 rounded-full" disabled={loading || busy || page <= 1} onClick={() => changePage(page - 1)} aria-label={m('previous')}><IconChevronLeft className="size-4" aria-hidden="true" /></Button><span className="text-sm tabular-nums">{m('pagination', { page, pages })}</span><Button variant="outline" className="size-11 rounded-full" disabled={loading || busy || page >= pages} onClick={() => changePage(page + 1)} aria-label={m('next')}><IconChevronRight className="size-4" aria-hidden="true" /></Button></nav> : null}
                  </>}
            </section>}
    </ArkiveEncyclopediaWorkspace>
    <Dialog open={selected != null && !denied} onOpenChange={open => { if (!open && !writeLock.current) { setSelected(null); setFailure(null) } }}>
      {selected && readyGateway ? <DialogContent size="lg" className="max-h-[calc(100dvh-2rem)] overflow-y-auto" closeButtonProps={{ 'aria-label': m('close'), disabled: busy }} onEscapeKeyDown={event => { if (writeLock.current) event.preventDefault() }} onInteractOutside={event => { if (writeLock.current) event.preventDefault() }}
        onCloseAutoFocus={event => { event.preventDefault(); const origin = focusOrigin.current; (origin?.isConnected && !origin.disabled ? origin : queueRef.current)?.focus({ preventScroll: true }) }}>
        <DialogHeader><DialogTitle>{m('view')}</DialogTitle><DialogDescription className="sr-only">{m('wholeUnit')}</DialogDescription></DialogHeader>
        {failure ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{m(failure)}</p>{failure === 'conflict' ? <Button variant="outline" className="min-h-11 rounded-full" onClick={reload}>{m('reload')}</Button> : null}</div> : null}
        <ReviewDetail key={`${selected.kind}:${selected.value.id}:${selected.value.revision}`} entry={selected} gateway={readyGateway} disabled={busy || failure === 'conflict'} busy={busy} onSave={save} />
      </DialogContent> : null}
    </Dialog>
  </main>
}

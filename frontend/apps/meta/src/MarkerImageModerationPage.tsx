import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth, useModerationAccess } from '@gamemap/auth'
import { ArkiveEncyclopediaWorkspace } from '@gamemap/map-shell'
import { ApiError, listPendingMarkerImages, reviewMarkerImage, result, type ApiClient, type MarkerImageRead } from '@gamemap/api-core'
import { Button, cn, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, PageSkeleton } from '@gamemap/ui'
import { IconAlertCircle, IconArrowLeft, IconCheck, IconChevronLeft, IconChevronRight, IconExternalLink, IconMapPin, IconMessage2, IconPhotoCheck, IconPhotoOff, IconRefresh, IconX } from '@tabler/icons-react'

const PAGE_SIZE = 20

/** A protected portal route; private queue state is discarded on account changes. */
export function MarkerImageModerationPage({ onSignIn }: { onSignIn: () => void }) {
  const auth = useAuth()
  const access = useModerationAccess()
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)
  const groups = [{ key: 'moderation', label: t('moderation.management'), entries: [{ key: 'images', label: t('moderation.mapImages'), icon: <IconPhotoCheck className="size-5" stroke={1.8} aria-hidden="true" /> }] }]
  return (
    <main className="arkive-content-page mx-auto w-full max-w-[var(--arkive-content-wide-data)] flex-1 px-[var(--arkive-page-gutter)] pb-12" data-testid="image-moderation-page">
      <h1 className="mb-4 text-lg font-semibold lg:sr-only lg:mb-0">{t('moderation.title')}</h1>
      <ArkiveEncyclopediaWorkspace groups={groups} active="images" label={t('moderation.management')} collapsed={collapsed} onCollapsedChange={setCollapsed}
        collapseLabel={t('moderation.collapse')} expandLabel={t('moderation.expand')}
        renderLink={(_entry, className, content) => <a href="#moderation/images" aria-current="page" className={className}>{content}</a>}
        railFooter={<a href="#account/edit" className="mt-6 inline-flex min-h-11 items-center gap-2 px-2 text-xs text-muted-foreground hover:text-foreground"><IconArrowLeft className="size-4" stroke={1.8} aria-hidden="true" />{t('moderation.back')}</a>}>
      {access.status === 'checking' ? <PageSkeleton label={t('moderation.checking')} />
        : access.status === 'anonymous' ? <div className="space-y-4 py-12"><p>{t(auth.enabled ? 'moderation.signInRequired' : 'moderation.unavailable')}</p>{auth.enabled ? <Button className="min-h-11 rounded-full" onClick={onSignIn}>{t('moderation.signIn')}</Button> : null}</div>
          : access.status === 'forbidden' ? <p role="alert" className="py-12">{t('moderation.forbidden')}</p>
            : access.status === 'error' ? <div role="alert" className="space-y-4 py-12"><p>{t('moderation.loadFailed')}</p><Button className="min-h-11 rounded-full" variant="outline" onClick={access.retry}>{t('moderation.retry')}</Button></div>
              : <ImageReviewQueue key={auth.user!.id} client={auth.client.requestClient} />}
      </ArkiveEncyclopediaWorkspace>
    </main>
  )
}

function ImageReviewQueue({ client }: { client: ApiClient['client'] }) {
  const { t, i18n } = useTranslation()
  const [images, setImages] = useState<MarkerImageRead[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<'loadFailed' | 'reviewFailed' | null>(null)
  const [notice, setNotice] = useState<'approved' | 'rejected' | null>(null)
  const [denied, setDenied] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const returnFocus = useRef<HTMLButtonElement | null>(null)
  const queueFocus = useRef<HTMLElement | null>(null)
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const selected = images.find((image) => image.id === selectedId)
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: 'medium', timeStyle: 'short' }), [i18n.resolvedLanguage, i18n.language])
  const refresh = () => setRevision((value) => value + 1)
  const rejectAccess = () => { setDenied(true); setImages([]); setCount(0) }

  useEffect(() => {
    let active = true
    setLoading(true)
    setFailure(null)
    void result(listPendingMarkerImages({ client, throwOnError: true, query: { page, pageSize: PAGE_SIZE } })).then((data) => {
      if (!active) return
      const lastPage = Math.max(1, Math.ceil(data.count / PAGE_SIZE))
      if (page > lastPage) { setPage(lastPage); return }
      setImages(data.results ?? [])
      setCount(data.count)
    }).catch((error: unknown) => {
      if (!active) return
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) rejectAccess()
      else setFailure('loadFailed')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [client, page, revision])

  const review = async (id: string, publish: boolean) => {
    setBusy(id)
    setFailure(null)
    setNotice(null)
    try {
      await result(reviewMarkerImage({ client, throwOnError: true, path: { id }, body: { publish } }))
      const remaining = images.filter((image) => image.id !== id)
      const next = remaining[Math.min(images.findIndex((image) => image.id === id), remaining.length - 1)]
      setSelectedId(next?.id ?? null)
      setImages(remaining)
      setCount((value) => Math.max(0, value - 1))
      setNotice(publish ? 'approved' : 'rejected')
      refresh()
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) rejectAccess()
      else setFailure('reviewFailed')
    } finally { setBusy(null) }
  }

  if (denied) return <p role="alert">{t('moderation.forbidden')}</p>
  return (
    <section ref={queueFocus} tabIndex={-1} className="focus-visible:outline-2 focus-visible:outline-ring" aria-busy={loading || busy != null} data-testid="image-review-queue" aria-label={t('moderation.queue')}>
      <div className="mb-4 flex min-h-[var(--arkive-catalog-control-height)] flex-wrap items-center justify-between gap-3" data-testid="image-review-toolbar">
        <span className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-3 text-sm font-medium"><IconPhotoCheck className="size-4" stroke={1.8} aria-hidden="true" />{t('moderation.queue')}</span>
        <Button variant="ghost" className="min-h-11 rounded-full" disabled={loading || busy != null} onClick={refresh}>
          <IconRefresh className={cn('size-4', loading && 'motion-safe:animate-spin')} stroke={1.8} aria-hidden="true" />{t('moderation.refresh')}
        </Button>
      </div>
      <p role="status" className={cn('mb-4 text-sm', !notice && 'sr-only')}>{notice ? t(`moderation.${notice}`) : !loading ? t('moderation.count', { count }) : ''}</p>
      {failure && !selected ? <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-[var(--arkive-radius-standard)] bg-destructive/10 p-4 text-sm">
        <IconAlertCircle className="size-5 shrink-0 text-destructive" stroke={1.8} aria-hidden="true" />
        <p className="min-w-0 flex-1">{t(`moderation.${failure}`)}</p>
        <Button variant="outline" className="min-h-11 rounded-full" disabled={loading || busy != null} onClick={refresh}>{t('moderation.retry')}</Button>
      </div> : null}
      {loading && !images.length ? <div className="min-h-80"><PageSkeleton label={t('moderation.loading')} /></div> : null}
      {!loading && !failure && !images.length ? <div className="py-12 text-center" data-testid="image-review-empty">
        <p className="text-sm">{t('moderation.empty')}</p>
        <p className="mx-auto mt-2 max-w-prose text-xs leading-relaxed text-muted-foreground">{t('moderation.emptyScope')}</p>
        <p className="mx-auto mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">{t('moderation.emptyHint')}</p>
      </div> : null}
      {images.length ? <ul className="divide-y divide-border" aria-label={t('moderation.chooseImage')}>
        {images.map((image) => <li key={image.id} data-testid="image-review-card">
          <button type="button" aria-haspopup="dialog" aria-expanded={selectedId === image.id} aria-controls={selectedId === image.id ? 'image-review-detail' : undefined} aria-label={t('moderation.selectImage', { author: image.author.name })}
            disabled={busy != null || loading} onClick={(event) => { returnFocus.current = event.currentTarget; setSelectedId(image.id) }}
            className="grid w-full grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-3 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)_auto] sm:gap-4">
            <img src={image.url} alt="" className="aspect-[4/3] w-full rounded-[var(--arkive-radius-standard)] bg-muted object-contain" loading="lazy" />
            <span className="min-w-0"><span className="block break-words text-sm font-medium">{image.author.name}</span><span className="mt-1 block text-xs text-muted-foreground">{t(`site.${image.game}.name`, { defaultValue: image.game })}</span><time dateTime={image.createdAt} className="mt-2 block text-xs text-muted-foreground">{dateFormat.format(new Date(image.createdAt))}</time></span>
            <span className="hidden min-w-0 sm:block"><span className="block text-xs text-muted-foreground">{t(image.commentId ? 'moderation.commentImage' : 'moderation.galleryImage')}</span><span className="mt-2 block break-all font-mono text-xs leading-relaxed">{image.map} / {image.marker}</span></span>
            <span className="inline-flex min-h-11 items-center gap-2 text-sm"><span className="hidden md:inline">{t('moderation.openReview')}</span><IconChevronRight className="size-4" stroke={1.8} aria-hidden="true" /></span>
          </button>
        </li>)}
      </ul> : null}
      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !busy) setSelectedId(null) }}>
        {selected ? <DialogContent size="lg" className="max-h-[calc(100dvh-2rem)] overflow-y-auto" closeButtonProps={{ 'aria-label': t('moderation.close'), disabled: busy != null }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const origin = returnFocus.current
            const target = origin?.isConnected && !origin.disabled ? origin : queueFocus.current
            target?.focus({ preventScroll: true })
          }}
          onEscapeKeyDown={(event) => { if (busy) event.preventDefault() }} onInteractOutside={(event) => { if (busy) event.preventDefault() }}>
          <DialogHeader><DialogTitle>{t('moderation.openReview')}</DialogTitle><DialogDescription className="sr-only">{t('moderation.previewAlt', { author: selected.author.name })}</DialogDescription></DialogHeader>
          {failure ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive"><p className="min-w-0 flex-1">{t(`moderation.${failure}`)}</p>{failure === 'loadFailed' ? <Button variant="outline" className="min-h-11 rounded-full" disabled={loading || busy != null} onClick={refresh}>{t('moderation.retry')}</Button> : null}</div> : null}
          <ImageReviewDetail image={selected} date={dateFormat.format(new Date(selected.createdAt))} disabled={loading || busy != null} busy={busy === selected.id} onReview={review} />
        </DialogContent> : null}
      </Dialog>
      {count > PAGE_SIZE ? <nav className="mt-8 flex flex-wrap items-center justify-center gap-3" aria-label={t('moderation.paginationLabel')}>
        <Button variant="outline" className="size-11 rounded-full" disabled={loading || busy != null || page <= 1} onClick={() => setPage((value) => value - 1)} aria-label={t('moderation.previous')}><IconChevronLeft className="size-4" stroke={1.8} aria-hidden="true" /></Button>
        <span className="text-sm tabular-nums">{t('moderation.pagination', { page, pages })}</span>
        <Button variant="outline" className="size-11 rounded-full" disabled={loading || busy != null || page >= pages} onClick={() => setPage((value) => value + 1)} aria-label={t('moderation.next')}><IconChevronRight className="size-4" stroke={1.8} aria-hidden="true" /></Button>
      </nav> : null}
    </section>
  )
}

function ImageReviewDetail({ image, date, disabled, busy, onReview }: { image: MarkerImageRead; date: string; disabled: boolean; busy: boolean; onReview: (id: string, publish: boolean) => Promise<void> }) {
  const { t } = useTranslation()
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const imageError = failedUrl === image.url
  const imageReady = loadedUrl === image.url && !imageError
  return (
    <article id="image-review-detail" className="min-w-0" data-testid="image-review-detail">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
        <span className="inline-flex items-center gap-2 text-sm font-medium"><IconPhotoCheck className="size-4 text-primary" stroke={1.8} aria-hidden="true" />{t('moderation.pending')}</span>
        <Button asChild variant="ghost" className="min-h-11 rounded-full"><a href={image.url} target="_blank" rel="noreferrer"><IconExternalLink className="size-4" stroke={1.8} aria-hidden="true" />{t('moderation.preview')}</a></Button>
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="relative flex aspect-[4/3] max-h-[28rem] w-full items-center justify-center overflow-hidden rounded-[var(--arkive-radius-media)] bg-muted/50">
          {imageError ? <div className="space-y-4 p-6 text-center" role="alert">
            <IconPhotoOff className="mx-auto size-8 text-muted-foreground" stroke={1.8} aria-hidden="true" />
            <p className="text-sm">{t('moderation.imageFailed')}</p>
            <Button variant="outline" className="min-h-11 rounded-full" onClick={() => { setLoadedUrl(null); setFailedUrl(null) }}>{t('moderation.retry')}</Button>
          </div> : <>
            <img key={image.url} src={image.url} alt={t('moderation.previewAlt', { author: image.author.name })} width={image.width} height={image.height} onLoad={() => setLoadedUrl(image.url)} onError={() => setFailedUrl(image.url)} className={cn('size-full object-contain', !imageReady && 'opacity-0')} />
            {!imageReady ? <p role="status" aria-label={t('moderation.imageLoading')} className="absolute inset-0 flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground"><IconRefresh className="size-4 motion-safe:animate-spin" stroke={1.8} aria-hidden="true" />{t('moderation.imageLoading')}</p> : null}
          </>}
        </div>
        <div className="space-y-6 p-4 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><h3 className="break-words text-base font-semibold">{image.author.name}</h3><time dateTime={image.createdAt} className="mt-1 block text-xs text-muted-foreground">{date}</time></div>
            <span className="rounded-full bg-muted px-3 py-1 text-xs">{t(`site.${image.game}.name`, { defaultValue: image.game })}</span>
          </div>
          <dl className="space-y-4 text-sm">
            <div><dt className="flex items-center gap-2 text-xs text-muted-foreground"><IconMapPin className="size-4" stroke={1.8} aria-hidden="true" />{t('moderation.location')}</dt><dd className="mt-2 break-all font-mono text-xs leading-relaxed">{image.map} / {image.marker}</dd></div>
            <div><dt className="sr-only">{t('moderation.source')}</dt><dd className="flex items-center gap-2 text-xs text-muted-foreground">{image.commentId ? <IconMessage2 className="size-4" stroke={1.8} aria-hidden="true" /> : <IconPhotoCheck className="size-4" stroke={1.8} aria-hidden="true" />}{t(image.commentId ? 'moderation.commentImage' : 'moderation.galleryImage')}</dd></div>
          </dl>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border p-4 md:p-6">
        <p className="text-xs text-muted-foreground">{t('moderation.reviewEffect')}</p>
        <div className="grid w-full grid-cols-2 gap-3 sm:w-auto">
          <Button variant="outline" className="min-h-11 rounded-full" disabled={disabled} onClick={() => void onReview(image.id, false)}><IconX className="size-4" stroke={1.8} aria-hidden="true" />{t(busy ? 'moderation.saving' : 'moderation.reject')}</Button>
          <Button className="arkive-dialog-primary min-h-11 rounded-full" disabled={disabled || !imageReady} onClick={() => void onReview(image.id, true)}><IconCheck className="size-4" stroke={1.8} aria-hidden="true" />{t(busy ? 'moderation.saving' : 'moderation.approve')}</Button>
        </div>
      </div>
    </article>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth, useModerationAccess } from '@gamemap/auth'
import { ApiError, listPendingMarkerImages, reviewMarkerImage, result, type ApiClient, type MarkerImageRead } from '@gamemap/api-core'
import { Button, PageSkeleton } from '@gamemap/ui'
import { IconArrowLeft, IconPhotoCheck } from '@tabler/icons-react'

const PAGE_SIZE = 20

/** A protected portal route; private queue state is discarded on account changes. */
export function MarkerImageModerationPage({ onSignIn }: { onSignIn: () => void }) {
  const auth = useAuth()
  const access = useModerationAccess()
  const { t } = useTranslation()
  return (
    <main className="arkive-content-page home-shell min-h-[60dvh] flex-1 pb-12" data-testid="image-moderation-page">
      <header className="mb-6">
        <a href="#account/edit" className="inline-flex min-h-9 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <IconArrowLeft className="size-4" aria-hidden="true" />{t('moderation.back')}
        </a>
        <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold"><IconPhotoCheck className="size-6 text-primary" aria-hidden="true" />{t('moderation.title')}</h1>
      </header>
      {access.status === 'checking' ? <PageSkeleton label={t('moderation.checking')} />
        : access.status === 'anonymous' ? <div className="space-y-3"><p>{t(auth.enabled ? 'moderation.signInRequired' : 'moderation.unavailable')}</p>{auth.enabled ? <Button onClick={onSignIn}>{t('moderation.signIn')}</Button> : null}</div>
          : access.status === 'forbidden' ? <p role="alert">{t('moderation.forbidden')}</p>
            : access.status === 'error' ? <div role="alert" className="space-y-3"><p>{t('moderation.loadFailed')}</p><Button variant="outline" onClick={access.retry}>{t('moderation.retry')}</Button></div>
              : <ImageReviewQueue key={auth.user!.id} client={auth.client.requestClient} />}
    </main>
  )
}

function ImageReviewQueue({ client }: { client: ApiClient['client'] }) {
  const { t, i18n } = useTranslation()
  const [images, setImages] = useState<MarkerImageRead[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<'loadFailed' | 'reviewFailed' | null>(null)
  const [denied, setDenied] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))
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
    try {
      await result(reviewMarkerImage({ client, throwOnError: true, path: { id }, body: { publish } }))
      setImages((current) => current.filter((image) => image.id !== id))
      setCount((value) => Math.max(0, value - 1))
      refresh()
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) rejectAccess()
      else setFailure('reviewFailed')
    } finally { setBusy(null) }
  }

  if (denied) return <p role="alert">{t('moderation.forbidden')}</p>
  return (
    <section aria-busy={loading || busy != null} data-testid="image-review-queue">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm text-muted-foreground">{t('moderation.scope')}</p>{!loading ? <p role="status" className="mt-1 text-sm font-medium">{t('moderation.count', { count })}</p> : null}</div>
        <Button variant="outline" disabled={loading || busy != null} onClick={refresh}>{t('moderation.refresh')}</Button>
      </div>
      {failure ? <div role="alert" className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm"><p>{t(`moderation.${failure}`)}</p><Button variant="outline" disabled={loading || busy != null} onClick={refresh}>{t('moderation.retry')}</Button></div> : null}
      {loading && !images.length ? <PageSkeleton label={t('moderation.loading')} /> : null}
      {!loading && !failure && !images.length ? <p role="status" className="py-12 text-center text-muted-foreground">{t('moderation.empty')}</p> : null}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {images.map((image) => (
          <article key={image.id} data-testid="image-review-card" className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
            <a href={image.url} target="_blank" rel="noreferrer" aria-label={t('moderation.preview')} className="flex h-64 items-center justify-center bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <img src={image.url} alt={t('moderation.previewAlt', { author: image.author.name })} width={image.width} height={image.height} className="size-full object-contain" loading="lazy" />
            </a>
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="break-words text-base font-semibold">{image.author.name}</h2><span className="rounded-md bg-muted px-2 py-1 text-xs">{t(`site.${image.game}.name`, { defaultValue: image.game })}</span></div>
              <time dateTime={image.createdAt} className="block text-xs text-muted-foreground">{dateFormat.format(new Date(image.createdAt))}</time>
              <dl className="text-xs"><dt className="text-muted-foreground">{t('moderation.location')}</dt><dd className="mt-1 break-all font-mono leading-relaxed">{image.map} / {image.marker}</dd></dl>
              <div className="grid grid-cols-2 gap-2">
                <Button disabled={busy != null || loading} onClick={() => void review(image.id, true)}>{t('moderation.approve')}</Button>
                <Button variant="outline" disabled={busy != null || loading} onClick={() => void review(image.id, false)}>{t('moderation.reject')}</Button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {count > PAGE_SIZE ? <nav className="mt-8 flex flex-wrap items-center justify-center gap-3" aria-label={t('moderation.paginationLabel')}>
        <Button variant="outline" disabled={loading || busy != null || page <= 1} onClick={() => setPage((value) => value - 1)}>{t('moderation.previous')}</Button>
        <span className="text-sm">{t('moderation.pagination', { page, pages })}</span>
        <Button variant="outline" disabled={loading || busy != null || page >= pages} onClick={() => setPage((value) => value + 1)}>{t('moderation.next')}</Button>
      </nav> : null}
    </section>
  )
}

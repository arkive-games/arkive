import { useEffect, useState } from 'react'
import { ApiError, listPendingMarkerImages, result, type ApiClient, type MarkerImageRead } from '@gamemap/api-core'
import { Button, PageSkeleton } from '@gamemap/ui'
import { useModerationCopy } from './shared'

/** Historical per-image records are inspectable, never a whole-unit write path. */
export function LegacyMarkerImageQueue({ client }: { client: ApiClient['client'] }) {
  const m = useModerationCopy()
  const [images, setImages] = useState<MarkerImageRead[]>([])
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(0)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [denied, setDenied] = useState(false)
  useEffect(() => {
    if (denied) return
    let active = true
    setLoading(true); setFailed(false)
    void result(listPendingMarkerImages({ client, throwOnError: true, query: { page, pageSize: 20 } })).then(data => {
      if (!active) return
      const lastPage = Math.max(1, Math.ceil(data.count / 20))
      if (page > lastPage) { setPage(lastPage); return }
      setImages(data.results ?? []); setCount(data.count)
    }).catch((error: unknown) => {
      if (!active) return
      setImages([]); setCount(0)
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) setDenied(true)
      else setFailed(true)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [client, page, revision, denied])
  if (denied) return <p role="alert" className="text-sm">{m('forbidden')}</p>
  return <section aria-busy={loading} aria-label={m('legacy')} data-testid="legacy-image-queue">
    <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{m('legacyReadOnly')}</p>
    {loading ? <PageSkeleton label={m('loading')} /> : failed ? <div role="alert" className="space-y-3"><p className="text-sm">{m('legacyFailure')}</p><Button variant="outline" className="min-h-11 rounded-full" onClick={() => setRevision(value => value + 1)}>{m('retry')}</Button></div>
      : images.length ? <ul className="divide-y divide-border">{images.map(image => <li key={image.id} className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-4 py-4">
        <a href={image.url} target="_blank" rel="noreferrer" aria-label={`${m('fullImage')} · ${image.author.name}`}><img src={image.url} alt="" className="aspect-square w-full rounded-[var(--arkive-radius-standard)] bg-muted object-contain" loading="lazy" /></a>
        <div className="min-w-0 space-y-1"><p className="break-words text-sm font-medium">{image.author.name}</p><p className="break-all text-xs text-muted-foreground">{image.game} · {image.map} / {image.marker}</p><time className="block text-xs text-muted-foreground" dateTime={image.createdAt}>{new Date(image.createdAt).toLocaleString()}</time></div>
      </li>)}</ul> : <div className="py-12 text-center"><p className="text-sm">{m('empty')}</p><p className="mt-2 text-xs text-muted-foreground">{m('emptyScope')}</p></div>}
    {count > 20 ? <nav className="mt-6 flex flex-wrap items-center justify-center gap-3" aria-label={m('pages')}><Button variant="outline" className="min-h-11 rounded-full" disabled={loading || page <= 1} onClick={() => { setImages([]); setPage(value => value - 1) }}>{m('previous')}</Button><span className="text-sm tabular-nums">{m('pagination', { page, pages: Math.ceil(count / 20) })}</span><Button variant="outline" className="min-h-11 rounded-full" disabled={loading || page * 20 >= count} onClick={() => { setImages([]); setPage(value => value + 1) }}>{m('next')}</Button></nav> : null}
  </section>
}

import {
  Children,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import {
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconMapPin,
  IconArrowBackUp,
  IconPhoto,
  IconMessageCircle,
  IconFlag,
  IconLoader2,
  IconPencil,
  IconThumbUp,
  IconTrash,
  IconX,
} from "@tabler/icons-react"
import { Button, cn } from "@gamemap/ui"
import { IdLabel, type IdLabelValue } from "./IdLabel"
import { placeMarkerDetailAbove } from "./markerDetailPlacement"

export type MarkerGalleryModerationStatus =
  | "uploading"
  | "processing"
  | "awaiting-review"
  | "published"
  | "rejected"
  | "failed"

/** Marker-owned media. It is never a comment attachment. */
export type MarkerGalleryImage = {
  id: string
  markerId: string
  url: string
  alt: string
  authorName?: string
  createdLabel?: string
  moderationStatus: MarkerGalleryModerationStatus
  moderationLabel?: string
}

/** Comment-owned media. The comment id is mandatory and no marker id is stored here. */
export type MarkerCommentAttachment = {
  id: string
  commentId: string
  url: string
  alt: string
  moderationLabel?: string
}

export type MarkerComment = {
  id: string
  markerId: string
  authorName: string
  authorAvatarUrl?: string
  authorInitial?: string
  createdLabel: string
  body: string
  attachments: MarkerCommentAttachment[]
  likeCount: number
  liked?: boolean
  replyCount: number
  /** The signed-in reader wrote it, so it may be edited and deleted. */
  mine?: boolean
  /** It has been edited since it was written, so the timestamp says so. */
  edited?: boolean
  /** It answers another comment, so it is indented beneath it. */
  reply?: boolean
}

export type MarkerCommentSort = "popular" | "latest"

/** The reasons a report may carry, matching the API's enum. */
export type MarkerCommentReportReason = "spam" | "abuse" | "offtopic" | "illegal" | "other"

export type MarkerDetailLabels = {
  close: string
  position: string
  copyPosition: string
  copied: string
  copyFailed: string
  details: string
  comments: string
  scrollArea: string
  collapseSection: (title: string) => string
  expandSection: (title: string) => string
  description: string
  gallery: string
  galleryDescription: string
  uploadImage: string
  galleryReviewNote: string
  commentCount: (count: number) => string
  popular: string
  latest: string
  like: string
  reply: string
  viewReplies: (count: number) => string
  commentPlaceholder: string
  attachImages: string
  attachmentLimit: string
  removeImage?: string
  publish: string
  /** Rewrite one of your own comments. */
  edit: string
  /** Shown beside an edited comment's timestamp. */
  edited: string
  /** Delete one of your own comments. */
  delete: string
  /** The confirmation before a delete, which cannot be undone. */
  deleteConfirm: string
  /** Report somebody else's comment. */
  report: string
  /** The label of the reason picker a report opens. */
  reportReason: string
  /** Cancels whichever inline control — the edit box or the reason picker — is open. */
  cancel: string
  /** One label per report reason, so the picker reads in the site's language. */
  reportReasons: Record<MarkerCommentReportReason, string>
  /** Refuses an empty edit before it reaches the network. */
  emptyComment: string
  /** Shown when writing, editing, deleting or reporting fails. */
  commentFailed: string
  /** The banner above the composer while it answers someone. */
  replyingTo: (name: string) => string
  emptyDetails: string
  emptyComments: string
  /** Shown in place of the empty state while the thread is still loading. */
  loadingComments?: string
  guestAuthor: string
  justNow: string
  awaitingReview: string
  signInRequired: string
  loadFailed: string
  imageTooLarge: string
  imageRejected: string
  reviewImages: string
  approveImage: string
  rejectImage: string
  noPendingImages: string
  loadMore: string
  retry: string
}

export type MarkerDetailSection = {
  id: string
  title: ReactNode
  accessibleTitle: string
  description?: ReactNode
  headerAction?: ReactNode
  content: ReactNode
  /** Compact preview shown only until the section is expanded for the first time. */
  collapsedContent?: ReactNode
  defaultExpanded?: boolean
  className?: string
}

export type MarkerGalleryConfig = {
  markerId: string
  images: MarkerGalleryImage[]
  onUpload?: (markerId: string, files: File[]) => void | Promise<void>
  loading?: boolean
}

export type MarkerCommentsConfig = {
  markerId: string
  items: MarkerComment[]
  sort: MarkerCommentSort
  onSortChange: (sort: MarkerCommentSort) => void
  onLike?: (commentId: string) => void
  onReply?: (commentId: string) => void
  onViewReplies?: (commentId: string) => void
  onSubmit?: (markerId: string, body: string, attachments: File[]) => void | Promise<void>
  submitting?: boolean
  /**
   * The thread is still being read. Without it an unanswered request is
   * indistinguishable from a marker nobody has commented on.
   */
  loading?: boolean
  onLoadMore?: () => Promise<void>
  error?: string | null
  onRetry?: () => void

  // The author's and the reporter's actions. Each is offered per comment — edit and
  // delete only on one the reader wrote, report only on one they did not — and each
  // closes over the id itself, so the host does not have to track which row is open.
  // A rejected promise is shown by the drawer beside the control that failed.
  onEdit?: (commentId: string, body: string) => Promise<void>
  onDelete?: (commentId: string) => Promise<void>
  onReport?: (commentId: string, reason: MarkerCommentReportReason) => Promise<void>

  /**
   * Whose comment the composer is answering, by display name, or undefined for a new
   * top-level comment. The host owns this rather than the drawer because the
   * submission has to carry the parent's id, which only the host sends.
   */
  replyingTo?: string
  onCancelReply?: () => void

  /**
   * Whether the composer offers image attachments. Defaults to true. A host whose
   * backend stores no comment images turns it off, so the button is absent rather
   * than present and silently discarding what was attached.
   */
  allowAttachments?: boolean
}

export type MarkerDetailCompleteAction = {
  completed: boolean
  label: string
  completedLabel: string
  onToggle: () => void
}

export type MarkerDetailDrawerProps = {
  idLabel?: IdLabelValue
  name: string
  icon?: ReactNode
  eyebrow?: ReactNode
  metaLine?: ReactNode
  /** Compact, details-only surface for points without a comment workflow. */
  compact?: boolean
  /** Tighten the identity row without removing the standard tabs and actions. */
  denseHeader?: boolean
  /** Small inline indicator beside the heading, such as a difficulty badge. */
  titleAccessory?: ReactNode
  positionValue?: ReactNode
  positionCopyValue?: string
  description?: string
  facts?: ReactNode
  children?: ReactNode
  sections?: MarkerDetailSection[]
  gallery?: MarkerGalleryConfig
  comments?: MarkerCommentsConfig
  completeAction?: MarkerDetailCompleteAction
  labels: MarkerDetailLabels
  onClose: () => void
  /** Desktop only: position above the engine-owned selected-marker anchor. */
  anchored?: boolean
  className?: string
}

function useAnchoredPlacement(enabled: boolean, placementKey: string) {
  const detailRef = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    const detail = detailRef.current
    if (!enabled || !detail || typeof window === "undefined") return
    const anchor = detail.closest<HTMLElement>("[data-marker-detail-anchor]")
    const mapRoot = anchor?.closest<HTMLElement>(".gm-map-root, .gmgl-map-root")
    if (!anchor || !mapRoot) return
    let lastPanRequest: { x: number; y: number } | null = null

    const update = () => {
      if (!window.matchMedia("(min-width: 768px)").matches) {
        detail.style.removeProperty("transform")
        detail.removeAttribute("data-placement")
        lastPanRequest = null
        return
      }
      const mapRect = mapRoot.getBoundingClientRect()
      const anchorRect = anchor.getBoundingClientRect()
      const detailRect = detail.getBoundingClientRect()
      if (!(mapRect.width > 0) || !(mapRect.height > 0) || !(detailRect.width > 0) || !(detailRect.height > 0)) return
      const targetsMapCenter = mapRoot.dataset.markerDetailFlyTarget === "center"
      const locksHorizontalCenter = mapRoot.dataset.markerDetailCenterLock === "true"
      const targetAnchor = targetsMapCenter
        ? { x: mapRect.width / 2, y: mapRect.height / 2 }
        : { x: anchorRect.left - mapRect.left, y: anchorRect.top - mapRect.top }

      const obstacles = Array.from(document.querySelectorAll<HTMLElement>("[data-map-avoid]"))
        .filter((element) => element !== detail && !detail.contains(element))
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({
          left: rect.left - mapRect.left,
          top: rect.top - mapRect.top,
          right: rect.right - mapRect.left,
          bottom: rect.bottom - mapRect.top,
        }))

      const result = placeMarkerDetailAbove({
        anchor: targetAnchor,
        size: { width: detailRect.width, height: detailRect.height },
        boundary: { left: 0, top: 0, right: mapRect.width, bottom: mapRect.height },
        obstacles,
      })
      detail.dataset.placement = "above"
      detail.style.setProperty("--marker-detail-arrow-x", `${Math.round(result.arrowX)}px`)
      detail.style.transform = `translate3d(${Math.round(result.x)}px, ${Math.round(result.y)}px, 0)`
      const panRequest = {
        x: targetsMapCenter || locksHorizontalCenter ? 0 : Math.round(result.panX),
        y: Math.round(result.panY),
      }
      if (panRequest.x === 0 && panRequest.y === 0) {
        if (lastPanRequest) {
          anchor.dispatchEvent(new CustomEvent("marker-detail-pan", { bubbles: true, detail: panRequest }))
        }
        lastPanRequest = null
      } else if (panRequest.x !== lastPanRequest?.x || panRequest.y !== lastPanRequest?.y) {
        lastPanRequest = panRequest
        anchor.dispatchEvent(new CustomEvent("marker-detail-pan", { bubbles: true, detail: panRequest }))
      }
    }

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update)
    const recheckAfterPan = () => {
      lastPanRequest = null
      update()
    }
    mapRoot.addEventListener("marker-detail-pan-settled", recheckAfterPan)
    resizeObserver?.observe(detail)
    resizeObserver?.observe(mapRoot)
    const anchorObserver = typeof MutationObserver === "undefined" ? null : new MutationObserver(update)
    anchorObserver?.observe(anchor, { attributes: true, attributeFilter: ["style"] })
    const mapStateObserver = typeof MutationObserver === "undefined" ? null : new MutationObserver(update)
    mapStateObserver?.observe(mapRoot, {
      attributes: true,
      attributeFilter: ["data-marker-detail-fly-target", "data-marker-detail-center-lock"],
    })
    window.addEventListener("resize", update)
    document.addEventListener("scroll", update, true)
    update()
    // The engine registers its native event listener after the child layout
    // effect runs, so repeat the initial correction once effects have settled.
    const initialFrame = window.requestAnimationFrame(() => {
      lastPanRequest = null
      update()
    })
    return () => {
      window.cancelAnimationFrame(initialFrame)
      resizeObserver?.disconnect()
      mapRoot.removeEventListener("marker-detail-pan-settled", recheckAfterPan)
      anchorObserver?.disconnect()
      mapStateObserver?.disconnect()
      window.removeEventListener("resize", update)
      document.removeEventListener("scroll", update, true)
    }
  }, [enabled, placementKey])

  return detailRef
}

export function MarkerDetailCollapsibleSection({ section, labels }: { section: MarkerDetailSection; labels: MarkerDetailLabels }) {
  const [expanded, setExpanded] = useState(section.defaultExpanded !== false)
  const [showInitialPreview, setShowInitialPreview] = useState(
    section.defaultExpanded === false && section.collapsedContent != null,
  )
  const contentId = useId()

  const toggleExpanded = () => {
    setShowInitialPreview(false)
    setExpanded((value) => !value)
  }

  return (
    <section
      data-testid={`marker-detail-section-${section.id}`}
      className={cn("border-b border-border bg-card px-3 py-2.5 last:border-b-0", section.className)}
    >
      <div className="flex min-h-8 items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
          {section.description ? <div className="mt-0.5 text-xs text-muted-foreground">{section.description}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
        {section.headerAction}
        <button
          type="button"
          data-testid={`marker-detail-collapse-${section.id}`}
          aria-controls={contentId}
          aria-expanded={expanded}
          aria-label={expanded ? labels.collapseSection(section.accessibleTitle) : labels.expandSection(section.accessibleTitle)}
          title={expanded ? labels.collapseSection(section.accessibleTitle) : labels.expandSection(section.accessibleTitle)}
          onClick={toggleExpanded}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IconChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} stroke={1.8} />
        </button>
        </div>
      </div>
      <div id={contentId} hidden={!expanded} className="pt-1.5">
        {expanded ? section.content : null}
      </div>
      {!expanded && showInitialPreview ? <div className="pt-1.5">{section.collapsedContent}</div> : null}
    </section>
  )
}

function GallerySection({ config, labels }: { config: MarkerGalleryConfig; labels: MarkerDetailLabels }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasContent = config.images.length > 0
  if (!hasContent && !config.onUpload) return null

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []).slice(0, 3)
    event.currentTarget.value = ""
    if (!files.length || !config.onUpload) return
    setUploading(true)
    setError(null)
    try { await config.onUpload(config.markerId, files) }
    catch (failure) { setError(failure instanceof Error ? failure.message : labels.commentFailed) }
    finally { setUploading(false) }
  }

  return (
    <MarkerDetailCollapsibleSection
      labels={labels}
      section={{
        id: "gallery",
        title: labels.gallery,
        accessibleTitle: labels.gallery,
        description: labels.galleryDescription,
        headerAction: config.onUpload ? (
          <label className={cn("inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-md px-2 text-xs text-primary hover:bg-accent", (uploading || config.loading) && "pointer-events-none opacity-50")}>
            <IconPhoto className="size-4" aria-hidden="true" />{labels.uploadImage}
            <input data-testid="marker-gallery-upload" type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple disabled={uploading || config.loading} className="sr-only" onChange={(event) => void upload(event)} />
          </label>
        ) : undefined,
        content: (
          <>
            {error ? <p role="alert" className="mb-2 text-xs text-destructive">{error}</p> : null}
            {config.images.length ? (
              <div className="grid grid-cols-2 gap-2 max-[350px]:grid-cols-1" data-testid="marker-gallery">
                {config.images.map((image) => (
                  <figure key={image.id} className="relative min-w-0 overflow-hidden rounded-lg bg-muted">
                    <img src={image.url} alt={image.alt} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                    {image.authorName || image.createdLabel || image.moderationLabel ? (
                      <figcaption className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-2 py-1.5 text-xs text-white">
                        {[image.authorName, image.createdLabel, image.moderationLabel].filter(Boolean).join(" / ")}
                      </figcaption>
                    ) : null}
                  </figure>
                ))}
              </div>
            ) : null}
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <IconPhoto className="size-4 shrink-0" stroke={1.8} />
              {labels.galleryReviewNote}
            </p>
          </>
        ),
      }}
    />
  )
}

function CommentList({ config, labels }: { config: MarkerCommentsConfig; labels: MarkerDetailLabels }) {
  // One row is being edited or reported at a time, which is why the state is here
  // rather than per article: two open editors is never what a reader meant, and a
  // single id makes "is this the row I am acting on" a comparison rather than a map.
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null)
  const [reporting, setReporting] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (id: string, action: () => Promise<void> | void) => {
    setBusy(id)
    setError(null)
    try {
      await action()
    } catch (failure) {
      // A host that rejects carries its own message, which is more specific than
      // anything the drawer could invent — "you are commenting too quickly" rather
      // than "something went wrong".
      setError(failure instanceof Error && failure.message ? failure.message : labels.commentFailed)
    } finally {
      setBusy(null)
    }
  }

  const saveEdit = (id: string) => {
    const trimmed = editing?.body.trim() ?? ""
    if (!trimmed) {
      setError(labels.emptyComment)
      return
    }
    void run(id, async () => {
      await config.onEdit?.(id, trimmed)
      setEditing(null)
    })
  }

  const confirmDelete = (id: string) => {
    if (typeof window !== "undefined" && !window.confirm(labels.deleteConfirm)) return
    void run(id, async () => { await config.onDelete?.(id) })
  }

  const submitReport = (id: string, reason: MarkerCommentReportReason) => {
    void run(id, async () => {
      await config.onReport?.(id, reason)
      setReporting(null)
    })
  }

  return (
    <div className="min-h-full bg-card" data-testid="marker-comments" aria-busy={config.loading || undefined}>
      {error || config.error ? (
        <p role="alert" data-testid="marker-comment-error" className="border-b border-border bg-destructive/10 px-3 py-2 text-xs text-destructive">{error || config.error}
          {config.error && config.onRetry ? <button type="button" className="ml-2 min-h-8 underline" onClick={config.onRetry}>{labels.retry}</button> : null}
        </p>
      ) : null}
      {!config.items.length && config.loading ? (
        <div role="status" className="flex min-h-12 items-center justify-center gap-2 px-4 py-3 text-center text-muted-foreground" data-testid="marker-comments-loading">
          <IconLoader2 className="size-5 animate-spin" stroke={1.8} aria-hidden="true" />
          <p className="text-sm">{labels.loadingComments ?? "…"}</p>
        </div>
      ) : null}
      {!config.items.length && !config.loading ? (
        <div className="flex min-h-12 items-center justify-center gap-2 px-4 py-3 text-center text-muted-foreground" data-testid="marker-comments-empty">
          <IconMessageCircle className="size-5" stroke={1.8} />
          <p className="text-sm">{labels.emptyComments}</p>
        </div>
      ) : null}
      {config.items.map((comment) => (
        <article key={comment.id} data-reply={comment.reply ? "" : undefined} className={cn("grid grid-cols-[2rem_minmax(0,1fr)] gap-2.5 border-b border-border p-3", comment.reply && "pl-12")}>
          <span className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {comment.authorAvatarUrl ? <img src={comment.authorAvatarUrl} alt="" className="size-full object-cover" /> : comment.authorInitial ?? comment.authorName.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <div>
              <strong className="block text-sm">{comment.authorName}</strong>
              <span className="text-xs text-muted-foreground">
                {comment.createdLabel}
                {comment.edited ? ` · ${labels.edited}` : ""}
              </span>
            </div>
            {editing?.id === comment.id ? (
              <div className="mt-1.5" data-testid="marker-comment-editor">
                <textarea
                  data-testid="marker-comment-edit-body"
                  rows={3}
                  value={editing.body}
                  onChange={(event) => setEditing({ id: comment.id, body: event.currentTarget.value })}
                  aria-label={labels.edit}
                  className="block min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" disabled={busy === comment.id || !editing.body.trim()} onClick={() => saveEdit(comment.id)}>{labels.publish}</Button>
                  <button type="button" onClick={() => { setEditing(null); setError(null) }} className="min-h-9 rounded-md px-2 text-xs font-semibold text-muted-foreground hover:bg-accent">{labels.cancel}</button>
                </div>
              </div>
            ) : (
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed">{comment.body}</p>
            )}
            {comment.attachments.length ? (
              <div className="mt-2 grid max-w-60 grid-cols-2 gap-2">
                {comment.attachments.map((attachment) => (
                  <figure key={attachment.id}>
                    <a href={attachment.url} target="_blank" rel="noreferrer"><img src={attachment.url} alt={attachment.alt} loading="lazy" className="aspect-video w-full rounded-lg object-cover" /></a>
                    {attachment.moderationLabel ? <figcaption className="mt-1 text-xs text-muted-foreground">{attachment.moderationLabel}</figcaption> : null}
                  </figure>
                ))}
              </div>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <button
                type="button"
                aria-label={labels.like}
                aria-pressed={comment.liked}
                onClick={() => config.onLike?.(comment.id)}
                disabled={!config.onLike}
                className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground enabled:hover:bg-accent enabled:hover:text-foreground disabled:opacity-70"
              >
                <IconThumbUp className="size-4" stroke={1.8} />{comment.likeCount}
              </button>
              <button
                type="button"
                onClick={() => config.onReply?.(comment.id)}
                disabled={!config.onReply}
                className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground enabled:hover:bg-accent enabled:hover:text-foreground disabled:opacity-70"
              >
                <IconArrowBackUp className="size-4" stroke={1.8} />{labels.reply}
              </button>
              {/* Edit and delete are offered only on what the reader wrote, report only
                  on what they did not: showing all three everywhere would put a
                  destructive control where a reader expects a correction. */}
              {comment.mine && config.onEdit ? (
                <button
                  type="button"
                  data-testid="marker-comment-edit"
                  onClick={() => { setEditing({ id: comment.id, body: comment.body }); setReporting(null); setError(null) }}
                  className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <IconPencil className="size-4" stroke={1.8} />{labels.edit}
                </button>
              ) : null}
              {comment.mine && config.onDelete ? (
                <button
                  type="button"
                  data-testid="marker-comment-delete"
                  disabled={busy === comment.id}
                  onClick={() => confirmDelete(comment.id)}
                  className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-70"
                >
                  <IconTrash className="size-4" stroke={1.8} />{labels.delete}
                </button>
              ) : null}
              {!comment.mine && config.onReport ? (
                <button
                  type="button"
                  data-testid="marker-comment-report"
                  aria-expanded={reporting === comment.id}
                  onClick={() => { setReporting(reporting === comment.id ? null : comment.id); setEditing(null); setError(null) }}
                  className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <IconFlag className="size-4" stroke={1.8} />{labels.report}
                </button>
              ) : null}
            </div>
            {reporting === comment.id ? (
              <div className="mt-1.5 rounded-lg border border-border bg-background p-2" data-testid="marker-comment-report-reasons">
                <p className="text-xs font-semibold text-muted-foreground">{labels.reportReason}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(Object.keys(labels.reportReasons) as MarkerCommentReportReason[]).map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      disabled={busy === comment.id}
                      onClick={() => submitReport(comment.id, reason)}
                      className="min-h-8 rounded-md border border-border px-2 text-xs hover:bg-accent disabled:opacity-70"
                    >
                      {labels.reportReasons[reason]}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {comment.replyCount ? (
              <button type="button" onClick={() => config.onViewReplies?.(comment.id)} disabled={!config.onViewReplies} className="mt-1 min-h-8 text-xs font-semibold text-primary disabled:opacity-70">
                {labels.viewReplies(comment.replyCount)}
              </button>
            ) : null}
          </div>
        </article>
      ))}
      {config.onLoadMore ? <button type="button" disabled={busy != null} className="min-h-10 w-full text-sm font-semibold text-primary disabled:opacity-50" onClick={() => void run("load-more", config.onLoadMore!)}>{labels.loadMore}</button> : null}
    </div>
  )
}

function CommentComposer({ config, labels }: { config: MarkerCommentsConfig; labels: MarkerDetailLabels }) {
  const [body, setBody] = useState("")
  const [attachments, setAttachments] = useState<File[]>([])
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)
  const previews = useMemo(() => attachments.map((file) => ({ file, url: URL.createObjectURL(file) })), [attachments])

  useEffect(() => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)), [previews])

  useLayoutEffect(() => {
    const textarea = bodyRef.current
    if (!textarea) return
    textarea.style.height = "auto"
    const maxHeight = Number.parseFloat(window.getComputedStyle(textarea).maxHeight)
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
  }, [body])

  const chooseAttachments = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.currentTarget.files ?? [])
    setAttachments((current) => {
      const files = [...current, ...selected]
      return files
        .filter((file, index) => files.findIndex((candidate) => (
          candidate.name === file.name
          && candidate.size === file.size
          && candidate.lastModified === file.lastModified
        )) === index)
        .slice(0, 3)
    })
    event.currentTarget.value = ""
  }

  const removeAttachment = (file: File) => {
    setAttachments((current) => current.filter((candidate) => candidate !== file))
  }

  const [failure, setFailure] = useState<string | null>(null)

  // Aiming the composer at a comment is a request to type, so focus follows it.
  useEffect(() => {
    if (config.replyingTo) bodyRef.current?.focus()
  }, [config.replyingTo])

  const submit = async () => {
    const trimmed = body.trim()
    if (!trimmed || !config.onSubmit) return
    setFailure(null)
    try {
      await config.onSubmit(config.markerId, trimmed, attachments)
    } catch (error) {
      // The draft is kept: losing what someone typed because the network blinked
      // is the one failure a comment box must not have.
      setFailure(error instanceof Error && error.message ? error.message : labels.commentFailed)
      return
    }
    setBody("")
    setAttachments([])
  }

  return (
    <div data-testid="marker-comment-composer">
      {config.replyingTo ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground" data-testid="marker-comment-replying">
          <span className="truncate">{labels.replyingTo(config.replyingTo)}</span>
          {config.onCancelReply ? (
            <button type="button" aria-label={labels.cancel} title={labels.cancel} onClick={config.onCancelReply} className="inline-flex size-6 shrink-0 items-center justify-center rounded hover:bg-accent hover:text-foreground">
              <IconX className="size-3.5" stroke={2} />
            </button>
          ) : null}
        </div>
      ) : null}
      {failure ? <p role="alert" data-testid="marker-comment-submit-error" className="mb-2 text-xs text-destructive">{failure}</p> : null}
      <textarea ref={bodyRef} rows={1} data-testid="marker-comment-body" value={body} onChange={(event) => setBody(event.currentTarget.value)} placeholder={labels.commentPlaceholder} className="block min-h-10 max-h-28 w-full resize-none overflow-y-auto rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30" />
      {previews.length ? (
        <div className="mt-2 flex flex-wrap gap-2" data-testid="marker-comment-previews">
          {previews.map(({ file, url }) => (
            <figure key={`${file.name}-${file.size}-${file.lastModified}`} className="relative size-14">
              <img src={url} alt={file.name} className="size-full rounded-md border border-border object-cover" />
              <button
                type="button"
                aria-label={`${labels.removeImage ?? "Remove image"}: ${file.name}`}
                title={labels.removeImage ?? "Remove image"}
                onClick={() => removeAttachment(file)}
                className="absolute -right-1.5 -top-1.5 inline-flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <IconX className="size-3.5" stroke={2} />
              </button>
            </figure>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-2">
        {config.allowAttachments !== false ? (
          <>
            <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-muted-foreground hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
              <IconPhoto className="size-4" stroke={1.8} />{labels.attachImages}
              <input data-testid="marker-comment-attachment" className="sr-only" type="file" accept="image/*" multiple onChange={chooseAttachments} />
            </label>
            <span className="text-xs text-muted-foreground max-[350px]:hidden">{labels.attachmentLimit}</span>
          </>
        ) : null}
        <Button size="sm" className="ml-auto" disabled={!config.onSubmit || !body.trim() || config.submitting} onClick={() => void submit()}>{labels.publish}</Button>
      </div>
    </div>
  )
}

export function MarkerDetailDrawer({
  idLabel,
  name,
  icon,
  eyebrow,
  metaLine,
  compact = false,
  denseHeader = false,
  titleAccessory,
  positionValue,
  positionCopyValue,
  description,
    facts,
  children,
  sections = [],
  gallery,
  comments,
  completeAction,
  labels,
  onClose,
  anchored = false,
  className,
}: MarkerDetailDrawerProps) {
  const sessionKey = gallery?.markerId ?? comments?.markerId ?? positionCopyValue ?? name
  const smallHeader = compact || denseHeader
  const detailRef = useAnchoredPlacement(anchored, sessionKey)
  const dragStartRef = useRef<{ y: number; at: number } | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [activeTab, setActiveTab] = useState<"details" | "comments">("details")
  const detailsTabId = useId()
  const commentsTabId = useId()
  const detailsPanelId = useId()
  const commentsPanelId = useId()

  const startDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(min-width: 768px)").matches) return
    dragStartRef.current = { y: event.clientY, at: performance.now() }
    setDragOffset(0)
    setIsDragging(true)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }, [])

  const moveDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current
    if (!start) return
    setDragOffset(Math.max(0, event.clientY - start.y))
  }, [])

  const finishDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const start = dragStartRef.current
    if (!start) return
    const distance = Math.max(0, event.clientY - start.y)
    const elapsed = Math.max(1, performance.now() - start.at)
    const drawerHeight = detailRef.current?.getBoundingClientRect().height ?? 0
    const distanceThreshold = drawerHeight > 0 ? Math.min(120, drawerHeight * 0.25) : 96
    const isFastSwipe = distance >= 48 && distance / elapsed >= 0.6

    dragStartRef.current = null
    setIsDragging(false)
    if (!cancelled && (distance >= distanceThreshold || isFastSwipe)) {
      onClose()
      return
    }
    setDragOffset(0)
  }, [detailRef, onClose])

  useEffect(() => {
    setActiveTab("details")
  }, [sessionKey])

  const copyPosition = useCallback(async () => {
    if (!positionCopyValue) return
    try {
      if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") throw new Error("Clipboard API unavailable")
      await navigator.clipboard.writeText(positionCopyValue)
    } catch (error) {
      console.error("Clipboard error", error)
    }
  }, [positionCopyValue])

  const effectiveGallery = gallery
  const effectiveComments = compact ? undefined : comments
  const panelTab = compact ? "details" : activeTab
  const detailSections: MarkerDetailSection[] = [
    ...(description?.trim() || facts ? [{ id: "description", title: labels.description, accessibleTitle: labels.description, content: <>{description?.trim() ? <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">{description}</p> : null}{facts ? <div className={description?.trim() ? "mt-3" : undefined}>{facts}</div> : null}</> }] : []),
    ...sections.filter((section) => section.content != null),
  ]
  const commentCount = effectiveComments?.items.length ?? 0
  const detailsEmpty = detailSections.length === 0
    && Children.toArray(children).length === 0
    && !effectiveGallery?.images.length

  return (
    <aside
      ref={detailRef}
      data-testid="marker-detail-drawer"
      aria-label={name}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      style={{ "--marker-detail-drag-y": `${dragOffset}px` } as CSSProperties}
      className={cn(
        "absolute inset-x-0 bottom-[env(safe-area-inset-bottom)] z-[var(--arkive-layer-sheet)] flex max-h-[min(60dvh,34rem,calc(100dvh-5rem-env(safe-area-inset-bottom)))] translate-y-[var(--marker-detail-drag-y)] flex-col overflow-hidden rounded-t-lg border border-border bg-background text-foreground shadow-[0_-1.2rem_3rem_rgba(21,40,45,0.22)] md:bottom-auto md:translate-y-0 md:rounded-lg md:shadow-[0_18px_50px_rgba(10,50,48,0.22)]",
        isDragging ? "transition-none" : "transition-transform duration-200 ease-out motion-reduce:transition-none",
        anchored
          ? "md:inset-auto md:left-0 md:top-0 md:w-[min(22rem,calc(100vw-1.5rem))] md:max-h-[min(34rem,calc(100dvh-7rem))] md:overflow-visible md:before:absolute md:before:-bottom-1.5 md:before:left-[var(--marker-detail-arrow-x,50%)] md:before:z-[-1] md:before:size-3 md:before:-translate-x-1/2 md:before:rotate-45 md:before:border md:before:border-border md:before:bg-background"
          : "md:inset-y-auto md:top-4 md:right-4 md:left-auto md:max-h-[min(calc(100dvh-2rem),38rem)] md:w-[min(25rem,calc(100%-2rem))]",
        className,
      )}
    >
      <div
        data-testid="marker-detail-drag-handle"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={(event) => finishDrag(event)}
        onPointerCancel={(event) => finishDrag(event, true)}
        className="flex h-5 shrink-0 touch-none cursor-grab items-center justify-center bg-card active:cursor-grabbing md:hidden"
      >
        <span className="h-1 w-10 rounded-full bg-muted-foreground/40" aria-hidden="true" />
      </div>
      <header className="shrink-0 border-b border-border bg-card">
        <div className={cn("grid items-center gap-2.5 px-3", smallHeader
          ? "grid-cols-[2rem_minmax(0,1fr)_2.25rem] py-1.5"
          : "grid-cols-[2.75rem_minmax(0,1fr)_2.25rem] py-2.5 max-md:grid-cols-[2.5rem_minmax(0,1fr)_2.25rem] max-md:py-2")}>
          <span className={cn("flex items-center justify-center overflow-hidden rounded-md border border-border bg-primary/10 text-primary", smallHeader ? "size-8" : "size-11 max-md:size-10")}>
            {icon ?? <IconMapPin className="size-6" stroke={1.8} />}
          </span>
          <div className="min-w-0">
            {eyebrow ? <div className="truncate text-xs font-semibold text-muted-foreground">{eyebrow}</div> : null}
            <div className={cn("flex min-w-0 gap-2", titleAccessory ? "items-center" : "items-baseline")}><h2 className={cn("truncate font-bold leading-normal", smallHeader ? "text-base" : "text-lg max-md:text-base")}>{name}</h2>{idLabel ? <IdLabel value={idLabel} className="shrink-0" /> : null}{titleAccessory ? <span className="shrink-0">{titleAccessory}</span> : null}</div>
            {metaLine ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{metaLine}</div> : null}
          </div>
          <button type="button" aria-label={labels.close} title={labels.close} onClick={onClose} className="inline-flex size-8 items-center justify-center justify-self-end rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><IconX className="size-5" stroke={1.8} /></button>
        </div>
      </header>

      {!compact ? <div className="grid shrink-0 grid-cols-2 border-b border-border bg-card" role="tablist" aria-label={name}>
        <button id={detailsTabId} type="button" role="tab" aria-selected={activeTab === "details"} aria-controls={detailsPanelId} onClick={() => setActiveTab("details")} className={cn("relative min-h-10 text-sm font-semibold text-muted-foreground after:absolute after:inset-x-4 after:bottom-[-1px] after:h-0.5 after:bg-transparent", activeTab === "details" && "text-primary after:bg-primary")}>{labels.details}</button>
        <button id={commentsTabId} type="button" role="tab" aria-selected={activeTab === "comments"} aria-controls={commentsPanelId} onClick={() => setActiveTab("comments")} className={cn("relative min-h-10 text-sm font-semibold text-muted-foreground after:absolute after:inset-x-4 after:bottom-[-1px] after:h-0.5 after:bg-transparent", activeTab === "comments" && "text-primary after:bg-primary")}>{labels.comments}{effectiveComments ? <span className="ml-1.5 inline-flex min-w-5 justify-center rounded-full bg-muted px-1.5 text-xs">{commentCount}</span> : null}</button>
      </div> : null}

      <div data-testid="marker-detail-scroll" tabIndex={0} aria-label={labels.scrollArea} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div id={detailsPanelId} role={compact ? undefined : "tabpanel"} aria-labelledby={compact ? undefined : detailsTabId} hidden={panelTab !== "details"}>
          {detailsEmpty ? (
            <div className="flex min-h-12 items-center justify-center gap-2 px-4 py-3 text-center text-muted-foreground" data-testid="marker-details-empty">
              <IconMapPin className="size-5" stroke={1.8} />
              <p className="text-sm">{labels.emptyDetails}</p>
            </div>
          ) : null}
          {detailSections.map((section) => <MarkerDetailCollapsibleSection key={section.id} section={section} labels={labels} />)}
          {children}
          {effectiveGallery ? <GallerySection config={effectiveGallery} labels={labels} /> : null}
        </div>
        {!compact ? <div id={commentsPanelId} role="tabpanel" aria-labelledby={commentsTabId} hidden={panelTab !== "comments"}>
          {effectiveComments ? <CommentList config={effectiveComments} labels={labels} /> : null}
        </div> : null}
      </div>

      {(panelTab === "details" ? positionValue || completeAction : effectiveComments) ? (
        <footer className="shrink-0 border-t border-border bg-card px-3 py-2 shadow-[0_-0.75rem_1.5rem_rgba(35,47,51,0.05)]">
          {panelTab === "details" ? (
            <div className="flex items-center justify-between gap-2">
              {positionValue ? <div data-testid="marker-detail-coordinates" className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <IconMapPin className="size-4 shrink-0" aria-hidden="true" />
                <span className="font-mono tabular-nums">{positionValue}</span>
                {positionCopyValue ? <button type="button" data-testid="marker-detail-position-copy" aria-label={labels.copyPosition} onClick={() => void copyPosition()} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><IconCopy className="size-4" aria-hidden="true" /></button> : null}
              </div> : <span />}
              {completeAction ? <Button size="sm" data-testid="marker-complete-toggle" aria-pressed={completeAction.completed} onClick={completeAction.onToggle} className={cn(completeAction.completed && "bg-emerald-600 hover:bg-emerald-600/90")}><IconCheck className="size-4" stroke={2} />{completeAction.completed ? completeAction.completedLabel : completeAction.label}</Button> : null}
            </div>
          ) : effectiveComments ? <CommentComposer config={effectiveComments} labels={labels} /> : null}
        </footer>
      ) : null}
    </aside>
  )
}

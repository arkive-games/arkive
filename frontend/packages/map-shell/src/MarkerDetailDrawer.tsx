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
  IconAlertCircle,
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconMapPin,
  IconArrowBackUp,
  IconPhoto,
  IconPhotoPlus,
  IconMessageCircle,
  IconThumbUp,
  IconX,
} from "@tabler/icons-react"
import { Button, cn } from "@gamemap/ui"
import { IdLabel, type IdLabelValue } from "./IdLabel"
import { placeMarkerDetailRight } from "./markerDetailPlacement"

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
}

export type MarkerCommentSort = "popular" | "latest"

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
  publish: string
  emptyDetails: string
  emptyComments: string
  guestAuthor: string
  justNow: string
  awaitingReview: string
}

export type MarkerDetailSection = {
  id: string
  title: ReactNode
  accessibleTitle: string
  description?: ReactNode
  headerAction?: ReactNode
  content: ReactNode
  collapsedContent?: ReactNode
  defaultExpanded?: boolean
  className?: string
}

export type MarkerGalleryConfig = {
  markerId: string
  images: MarkerGalleryImage[]
  onUpload?: (markerId: string, files: File[]) => void | Promise<void>
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
  /** Desktop only: position around the engine-owned selected-marker anchor. */
  anchored?: boolean
  className?: string
}

function useAnchoredPlacement(enabled: boolean) {
  const detailRef = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    const detail = detailRef.current
    if (!enabled || !detail || typeof window === "undefined") return
    const anchor = detail.closest<HTMLElement>("[data-marker-detail-anchor]")
    const mapRoot = anchor?.closest<HTMLElement>(".gm-map-root, .gmgl-map-root")
    if (!anchor || !mapRoot) return

    const update = () => {
      if (!window.matchMedia("(min-width: 768px)").matches) {
        detail.style.removeProperty("transform")
        detail.removeAttribute("data-placement")
        return
      }
      const mapRect = mapRoot.getBoundingClientRect()
      const anchorRect = anchor.getBoundingClientRect()
      const detailRect = detail.getBoundingClientRect()
      if (!(mapRect.width > 0) || !(mapRect.height > 0) || !(detailRect.width > 0) || !(detailRect.height > 0)) return

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

      const result = placeMarkerDetailRight({
        anchor: {
          x: anchorRect.left - mapRect.left,
          y: anchorRect.top - mapRect.top,
        },
        size: { width: detailRect.width, height: detailRect.height },
        boundary: { left: 0, top: 0, right: mapRect.width, bottom: mapRect.height },
        obstacles,
      })
      detail.dataset.placement = "right"
      detail.style.setProperty("--marker-detail-arrow-y", `${Math.round(result.arrowY)}px`)
      detail.style.transform = `translate3d(${Math.round(result.x)}px, ${Math.round(result.y)}px, 0)`
      if (result.panX > 0) {
        anchor.dispatchEvent(new CustomEvent("marker-detail-pan", { bubbles: true, detail: { x: result.panX } }))
      }
    }

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update)
    resizeObserver?.observe(detail)
    resizeObserver?.observe(mapRoot)
    const anchorObserver = typeof MutationObserver === "undefined" ? null : new MutationObserver(update)
    anchorObserver?.observe(anchor, { attributes: true, attributeFilter: ["style"] })
    window.addEventListener("resize", update)
    document.addEventListener("scroll", update, true)
    update()
    return () => {
      resizeObserver?.disconnect()
      anchorObserver?.disconnect()
      window.removeEventListener("resize", update)
      document.removeEventListener("scroll", update, true)
    }
  }, [enabled])

  return detailRef
}

export function MarkerDetailCollapsibleSection({ section, labels }: { section: MarkerDetailSection; labels: MarkerDetailLabels }) {
  const [expanded, setExpanded] = useState(section.defaultExpanded !== false)
  const contentId = useId()

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
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IconChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} stroke={1.8} />
        </button>
        </div>
      </div>
      <div id={contentId} hidden={!expanded && section.collapsedContent == null} className="pt-1.5">
        {expanded ? section.content : section.collapsedContent}
      </div>
    </section>
  )
}

function GallerySection({ config, labels }: { config: MarkerGalleryConfig; labels: MarkerDetailLabels }) {
  const hasContent = config.images.length > 0
  if (!hasContent) return null

  return (
    <MarkerDetailCollapsibleSection
      labels={labels}
      section={{
        id: "gallery",
        title: labels.gallery,
        accessibleTitle: labels.gallery,
        description: labels.galleryDescription,
        content: (
          <>
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
  return (
    <div className="min-h-full bg-card" data-testid="marker-comments">
      <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border px-3">
        <strong className="text-sm">{labels.commentCount(config.items.length)}</strong>
        <div className="flex" role="group" aria-label={labels.comments}>
          {(["popular", "latest"] as const).map((sort) => (
            <button
              key={sort}
              type="button"
              aria-pressed={config.sort === sort}
              onClick={() => config.onSortChange(sort)}
              className={cn(
                "min-h-9 rounded-md px-2 text-xs font-semibold text-muted-foreground hover:bg-accent",
                config.sort === sort && "text-primary",
              )}
            >
              {sort === "popular" ? labels.popular : labels.latest}
            </button>
          ))}
        </div>
      </div>
      {!config.items.length ? (
        <div className="flex min-h-28 flex-col items-center justify-center gap-2 px-4 py-6 text-center text-muted-foreground" data-testid="marker-comments-empty">
          <IconMessageCircle className="size-5" stroke={1.8} />
          <p className="text-sm">{labels.emptyComments}</p>
        </div>
      ) : null}
      {config.items.map((comment) => (
        <article key={comment.id} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2.5 border-b border-border p-3">
          <span className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {comment.authorAvatarUrl ? <img src={comment.authorAvatarUrl} alt="" className="size-full object-cover" /> : comment.authorInitial ?? comment.authorName.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <div><strong className="block text-sm">{comment.authorName}</strong><span className="text-xs text-muted-foreground">{comment.createdLabel}</span></div>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed">{comment.body}</p>
            {comment.attachments.length ? (
              <div className="mt-2 grid max-w-60 grid-cols-2 gap-2">
                {comment.attachments.map((attachment) => (
                  <img key={attachment.id} src={attachment.url} alt={attachment.alt} loading="lazy" className="aspect-video w-full rounded-lg object-cover" />
                ))}
              </div>
            ) : null}
            <div className="mt-1.5 flex items-center gap-1">
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
            </div>
            {comment.replyCount ? (
              <button type="button" onClick={() => config.onViewReplies?.(comment.id)} disabled={!config.onViewReplies} className="mt-1 min-h-8 text-xs font-semibold text-primary disabled:opacity-70">
                {labels.viewReplies(comment.replyCount)}
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  )
}

function GalleryUploadControl({ config, labels }: { config: MarkerGalleryConfig; labels: MarkerDetailLabels }) {
  return (
    <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-within:ring-2 focus-within:ring-ring">
      <IconPhotoPlus className="size-4" stroke={1.8} />
      {labels.uploadImage}
      <input
        data-testid="marker-gallery-upload"
        className="sr-only"
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []).slice(0, 3)
          if (files.length) void config.onUpload?.(config.markerId, files)
          event.currentTarget.value = ""
        }}
      />
    </label>
  )
}

function CommentComposer({ config, labels }: { config: MarkerCommentsConfig; labels: MarkerDetailLabels }) {
  const [body, setBody] = useState("")
  const [attachments, setAttachments] = useState<File[]>([])
  const previews = useMemo(() => attachments.map((file) => ({ file, url: URL.createObjectURL(file) })), [attachments])

  useEffect(() => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)), [previews])

  const chooseAttachments = (event: ChangeEvent<HTMLInputElement>) => {
    setAttachments(Array.from(event.currentTarget.files ?? []).slice(0, 3))
    event.currentTarget.value = ""
  }

  const submit = async () => {
    const trimmed = body.trim()
    if (!trimmed || !config.onSubmit) return
    await config.onSubmit(config.markerId, trimmed, attachments)
    setBody("")
    setAttachments([])
  }

  return (
    <div data-testid="marker-comment-composer">
      <textarea data-testid="marker-comment-body" value={body} onChange={(event) => setBody(event.currentTarget.value)} placeholder={labels.commentPlaceholder} className="block min-h-17 max-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30" />
      {previews.length ? <div className="mt-2 flex gap-2">{previews.map(({ file, url }) => <img key={`${file.name}-${file.lastModified}`} src={url} alt={file.name} className="size-14 rounded-md border border-border object-cover" />)}</div> : null}
      <div className="mt-2 flex items-center gap-2">
        <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-muted-foreground hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
          <IconPhoto className="size-4" stroke={1.8} />{labels.attachImages}
          <input data-testid="marker-comment-attachment" className="sr-only" type="file" accept="image/*" multiple onChange={chooseAttachments} />
        </label>
        <span className="text-xs text-muted-foreground max-[350px]:hidden">{labels.attachmentLimit}</span>
        <Button size="sm" className="ml-auto" disabled={!body.trim() || config.submitting} onClick={() => void submit()}>{labels.publish}</Button>
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
  const detailRef = useAnchoredPlacement(anchored)
  const dragStartRef = useRef<{ y: number; at: number } | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [activeTab, setActiveTab] = useState<"details" | "comments">("details")
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  const [sessionImages, setSessionImages] = useState<MarkerGalleryImage[]>([])
  const [sessionComments, setSessionComments] = useState<MarkerComment[]>([])
  const [commentLikeOverrides, setCommentLikeOverrides] = useState<Record<string, boolean>>({})
  const ownedObjectUrls = useRef(new Set<string>())
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

  const sessionKey = gallery?.markerId ?? comments?.markerId ?? positionCopyValue ?? name

  useEffect(() => {
    setActiveTab("details")
    setCopyState("idle")
    setSessionImages([])
    setSessionComments([])
    setCommentLikeOverrides({})
    return () => {
      ownedObjectUrls.current.forEach((url) => URL.revokeObjectURL(url))
      ownedObjectUrls.current.clear()
    }
  }, [sessionKey])

  useEffect(() => {
    if (copyState === "idle") return
    const timeout = setTimeout(() => setCopyState("idle"), 2000)
    return () => clearTimeout(timeout)
  }, [copyState])

  const copyPosition = useCallback(async () => {
    if (!positionCopyValue) return
    try {
      if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") throw new Error("Clipboard API unavailable")
      await navigator.clipboard.writeText(positionCopyValue)
      setCopyState("copied")
    } catch (error) {
      console.error("Clipboard error", error)
      setCopyState("failed")
    }
  }, [positionCopyValue])

  const createOwnedObjectUrl = useCallback((file: File) => {
    const url = URL.createObjectURL(file)
    ownedObjectUrls.current.add(url)
    return url
  }, [])

  const effectiveGallery = gallery ? {
    ...gallery,
    images: [...gallery.images, ...sessionImages],
    onUpload: gallery.onUpload ?? ((markerId: string, files: File[]) => {
      setSessionImages((current) => [
        ...current,
        ...files.map((file, index) => ({
          id: `session-gallery-${markerId}-${file.lastModified}-${index}`,
          markerId,
          url: createOwnedObjectUrl(file),
          alt: file.name,
          moderationStatus: "awaiting-review" as const,
          moderationLabel: labels.awaitingReview,
        })),
      ])
    }),
  } : undefined
  const effectiveComments = comments ? {
    ...comments,
    items: [...sessionComments, ...comments.items].map((comment) => {
      const liked = commentLikeOverrides[comment.id]
      if (liked == null || liked === Boolean(comment.liked)) return comment
      return {
        ...comment,
        liked,
        likeCount: Math.max(0, comment.likeCount + (liked ? 1 : -1)),
      }
    }),
    onSubmit: comments.onSubmit ?? ((markerId: string, body: string, attachments: File[]) => {
      const commentId = `session-comment-${markerId}-${Date.now()}`
      setSessionComments((current) => [{
        id: commentId,
        markerId,
        authorName: labels.guestAuthor,
        authorInitial: labels.guestAuthor.slice(0, 1),
        createdLabel: labels.justNow,
        body,
        attachments: attachments.map((file, index) => ({
          id: `${commentId}-attachment-${index}`,
          commentId,
          url: createOwnedObjectUrl(file),
          alt: file.name,
        })),
        likeCount: 0,
        replyCount: 0,
      }, ...current])
    }),
    onLike: comments.onLike ?? ((commentId: string) => {
      const source = [...sessionComments, ...comments.items].find((comment) => comment.id === commentId)
      setCommentLikeOverrides((current) => ({
        ...current,
        [commentId]: !(current[commentId] ?? source?.liked ?? false),
      }))
    }),
    onReply: comments.onReply ?? (() => {
      detailRef.current?.querySelector<HTMLTextAreaElement>("[data-testid='marker-comment-body']")?.focus()
    }),
  } : undefined
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
        "absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4rem)] z-[var(--arkive-layer-sheet)] flex max-h-[min(60dvh,34rem,calc(100dvh-5rem-env(safe-area-inset-bottom)))] translate-y-[var(--marker-detail-drag-y)] flex-col overflow-hidden rounded-t-lg border border-border bg-background text-foreground shadow-[0_-1.2rem_3rem_rgba(21,40,45,0.22)] md:bottom-auto md:translate-y-0 md:rounded-lg md:shadow-[0_18px_50px_rgba(10,50,48,0.22)]",
        isDragging ? "transition-none" : "transition-transform duration-200 ease-out motion-reduce:transition-none",
        anchored
          ? "md:inset-auto md:left-0 md:top-0 md:w-[min(22rem,calc(100vw-1.5rem))] md:max-h-[min(34rem,calc(100dvh-1.5rem))] md:overflow-visible md:before:absolute md:before:-left-1.5 md:before:top-[var(--marker-detail-arrow-y,50%)] md:before:z-[-1] md:before:size-3 md:before:-translate-y-1/2 md:before:rotate-45 md:before:border md:before:border-border md:before:bg-background"
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
        <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.25rem] items-center gap-2.5 px-3 py-2.5 max-md:grid-cols-[2.5rem_minmax(0,1fr)_2.25rem] max-md:py-2">
          <span className="flex size-11 items-center justify-center overflow-hidden rounded-md border border-border bg-primary/10 text-primary max-md:size-10">
            {icon ?? <IconMapPin className="size-6" stroke={1.8} />}
          </span>
          <div className="min-w-0">
            {eyebrow ? <div className="truncate text-xs font-semibold text-muted-foreground">{eyebrow}</div> : null}
            <div className="flex min-w-0 items-baseline gap-2"><h2 className="truncate text-lg font-bold leading-normal max-md:text-base">{name}</h2>{idLabel ? <IdLabel value={idLabel} className="shrink-0" /> : null}</div>
            {metaLine ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{metaLine}</div> : null}
          </div>
          <button type="button" aria-label={labels.close} title={labels.close} onClick={onClose} className="inline-flex size-8 items-center justify-center justify-self-end rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><IconX className="size-5" stroke={1.8} /></button>
        </div>
        {positionValue ? (
          <div className="mx-3 mb-2.5 flex min-h-9 items-center justify-between gap-2 rounded-md bg-primary/10 px-2.5">
            <div className="flex min-w-0 items-center gap-2 text-xs"><IconMapPin className="size-4 shrink-0 text-primary" stroke={1.8} /><span className="font-semibold text-primary">{labels.position}</span><strong className="truncate font-mono tabular-nums">{positionValue}</strong></div>
            {positionCopyValue ? <button type="button" data-testid="marker-detail-position-copy" aria-label={copyState === "copied" ? labels.copied : copyState === "failed" ? labels.copyFailed : labels.copyPosition} onClick={() => void copyPosition()} className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-md bg-card px-2 text-xs font-semibold text-primary hover:bg-accent">{copyState === "copied" ? <IconCheck className="size-4" /> : copyState === "failed" ? <IconAlertCircle className="size-4" /> : <IconCopy className="size-4" />}<span className="max-md:hidden">{copyState === "copied" ? labels.copied : copyState === "failed" ? labels.copyFailed : labels.copyPosition}</span></button> : null}
          </div>
        ) : null}
      </header>

      <div className="grid shrink-0 grid-cols-2 border-b border-border bg-card" role="tablist" aria-label={name}>
        <button id={detailsTabId} type="button" role="tab" aria-selected={activeTab === "details"} aria-controls={detailsPanelId} onClick={() => setActiveTab("details")} className={cn("relative min-h-10 text-sm font-semibold text-muted-foreground after:absolute after:inset-x-4 after:bottom-[-1px] after:h-0.5 after:bg-transparent", activeTab === "details" && "text-primary after:bg-primary")}>{labels.details}</button>
        <button id={commentsTabId} type="button" role="tab" aria-selected={activeTab === "comments"} aria-controls={commentsPanelId} onClick={() => setActiveTab("comments")} className={cn("relative min-h-10 text-sm font-semibold text-muted-foreground after:absolute after:inset-x-4 after:bottom-[-1px] after:h-0.5 after:bg-transparent", activeTab === "comments" && "text-primary after:bg-primary")}>{labels.comments}{effectiveComments ? <span className="ml-1.5 inline-flex min-w-5 justify-center rounded-full bg-muted px-1.5 text-xs">{commentCount}</span> : null}</button>
      </div>

      <div data-testid="marker-detail-scroll" tabIndex={0} aria-label={labels.scrollArea} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div id={detailsPanelId} role="tabpanel" aria-labelledby={detailsTabId} hidden={activeTab !== "details"}>
          {detailsEmpty ? (
            <div className="flex min-h-24 flex-col items-center justify-center gap-2 px-5 py-6 text-center text-muted-foreground" data-testid="marker-details-empty">
              <IconMapPin className="size-5" stroke={1.8} />
              <p className="text-sm">{labels.emptyDetails}</p>
            </div>
          ) : null}
          {detailSections.map((section) => <MarkerDetailCollapsibleSection key={section.id} section={section} labels={labels} />)}
          {children}
          {effectiveGallery ? <GallerySection config={effectiveGallery} labels={labels} /> : null}
        </div>
        <div id={commentsPanelId} role="tabpanel" aria-labelledby={commentsTabId} hidden={activeTab !== "comments"}>
          {effectiveComments ? <CommentList config={effectiveComments} labels={labels} /> : null}
        </div>
      </div>

      {(activeTab === "details" ? effectiveGallery || completeAction : effectiveComments) ? (
        <footer className="shrink-0 border-t border-border bg-card px-3 py-2 shadow-[0_-0.75rem_1.5rem_rgba(35,47,51,0.05)]">
          {activeTab === "details" ? (
            <div className="flex items-center justify-between gap-2">
              {effectiveGallery ? <GalleryUploadControl config={effectiveGallery} labels={labels} /> : <span />}
              {completeAction ? <Button size="sm" data-testid="marker-complete-toggle" aria-pressed={completeAction.completed} onClick={completeAction.onToggle} className={cn(completeAction.completed && "bg-emerald-600 hover:bg-emerald-600/90")}><IconCheck className="size-4" stroke={2} />{completeAction.completed ? completeAction.completedLabel : completeAction.label}</Button> : null}
            </div>
          ) : effectiveComments ? <CommentComposer config={effectiveComments} labels={labels} /> : null}
        </footer>
      ) : null}
    </aside>
  )
}

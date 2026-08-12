import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type ChangeEvent,
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
  IconThumbUp,
  IconUpload,
  IconX,
} from "@tabler/icons-react"
import { Button, cn } from "@gamemap/ui"
import { IdLabel, type IdLabelValue } from "./IdLabel"

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
}

export type MarkerDetailSection = {
  id: string
  title: ReactNode
  accessibleTitle: string
  description?: ReactNode
  headerAction?: ReactNode
  content: ReactNode
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
  className?: string
}

export function MarkerDetailCollapsibleSection({ section, labels }: { section: MarkerDetailSection; labels: MarkerDetailLabels }) {
  const [expanded, setExpanded] = useState(section.defaultExpanded !== false)
  const contentId = useId()

  return (
    <section
      data-testid={`marker-detail-section-${section.id}`}
      className={cn("border-b border-border bg-card px-4 py-4 last:border-b-0", section.className)}
    >
      <div className="flex min-h-9 items-center justify-between gap-3">
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
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IconChevronDown className={cn("size-4 transition-transform", !expanded && "-rotate-90")} stroke={1.8} />
        </button>
        </div>
      </div>
      <div id={contentId} hidden={!expanded} className="pt-2">
        {section.content}
      </div>
    </section>
  )
}

function GallerySection({ config, labels }: { config: MarkerGalleryConfig; labels: MarkerDetailLabels }) {
  const hasContent = config.images.length > 0 || Boolean(config.onUpload)
  if (!hasContent) return null

  return (
    <MarkerDetailCollapsibleSection
      labels={labels}
      section={{
        id: "gallery",
        title: labels.gallery,
        accessibleTitle: labels.gallery,
        description: labels.galleryDescription,
        headerAction: config.onUpload ? (
          <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-primary hover:bg-primary/10 focus-within:ring-2 focus-within:ring-ring">
            <IconUpload className="size-4" stroke={1.8} />
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
        ) : undefined,
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
      <div className="flex min-h-13 items-center justify-between gap-3 border-b border-border px-4">
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
      {config.items.map((comment) => (
        <article key={comment.id} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 border-b border-border p-4">
          <span className="flex size-9 items-center justify-center overflow-hidden rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {comment.authorAvatarUrl ? <img src={comment.authorAvatarUrl} alt="" className="size-full object-cover" /> : comment.authorInitial ?? comment.authorName.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <div><strong className="block text-sm">{comment.authorName}</strong><span className="text-xs text-muted-foreground">{comment.createdLabel}</span></div>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{comment.body}</p>
            {comment.attachments.length ? (
              <div className="mt-2 grid max-w-60 grid-cols-2 gap-2">
                {comment.attachments.map((attachment) => (
                  <img key={attachment.id} src={attachment.url} alt={attachment.alt} loading="lazy" className="aspect-video w-full rounded-lg object-cover" />
                ))}
              </div>
            ) : null}
            <div className="mt-2 flex items-center gap-1">
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
      <textarea value={body} onChange={(event) => setBody(event.currentTarget.value)} placeholder={labels.commentPlaceholder} className="block min-h-17 max-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30" />
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
  className,
}: MarkerDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<"details" | "comments">("details")
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  const detailsTabId = useId()
  const commentsTabId = useId()
  const detailsPanelId = useId()
  const commentsPanelId = useId()

  useEffect(() => {
    setActiveTab("details")
    setCopyState("idle")
  }, [positionCopyValue])

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

  const detailSections: MarkerDetailSection[] = [
    ...(description?.trim() || facts ? [{ id: "description", title: labels.description, accessibleTitle: labels.description, content: <>{description?.trim() ? <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">{description}</p> : null}{facts ? <div className={description?.trim() ? "mt-3" : undefined}>{facts}</div> : null}</> }] : []),
    ...sections.filter((section) => section.content != null),
  ]
  const commentCount = comments?.items.length ?? 0

  return (
    <aside
      data-testid="marker-detail-drawer"
      aria-label={name}
      className={cn(
        "absolute inset-x-0 bottom-0 z-[var(--arkive-layer-sheet)] flex h-[min(78dvh,46rem)] flex-col overflow-hidden rounded-t-lg border border-b-0 border-border bg-background text-foreground shadow-[0_-1.2rem_3rem_rgba(21,40,45,0.22)] md:inset-y-4 md:right-4 md:left-auto md:h-auto md:w-[min(29rem,calc(100%-2rem))] md:rounded-lg md:border-b md:shadow-[0_18px_50px_rgba(10,50,48,0.22)]",
        className,
      )}
    >
      <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/35 md:hidden" aria-hidden="true" />
      <header className="shrink-0 border-b border-border bg-card">
        <div className="grid grid-cols-[3.25rem_minmax(0,1fr)_2.5rem] gap-3 p-4 max-md:grid-cols-[2.75rem_minmax(0,1fr)_2.5rem] max-md:px-4 max-md:py-2">
          <span className="flex size-[3.25rem] items-center justify-center overflow-hidden rounded-lg border border-border bg-primary/10 text-primary max-md:size-11">
            {icon ?? <IconMapPin className="size-6" stroke={1.8} />}
          </span>
          <div className="min-w-0">
            {eyebrow ? <div className="truncate text-xs font-semibold text-muted-foreground">{eyebrow}</div> : null}
            <div className="flex min-w-0 items-baseline gap-2"><h2 className="truncate text-lg font-bold leading-normal max-md:text-base">{name}</h2>{idLabel ? <IdLabel value={idLabel} className="shrink-0" /> : null}</div>
            {metaLine ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{metaLine}</div> : null}
          </div>
          <button type="button" aria-label={labels.close} title={labels.close} onClick={onClose} className="inline-flex size-9 items-center justify-center justify-self-end rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><IconX className="size-5" stroke={1.8} /></button>
        </div>
        {positionValue ? (
          <div className="mx-4 mb-4 flex min-h-10 items-center justify-between gap-3 rounded-lg bg-primary/10 px-3 max-md:mb-3">
            <div className="flex min-w-0 items-center gap-2 text-xs"><IconMapPin className="size-4 shrink-0 text-primary" stroke={1.8} /><span className="font-semibold text-primary">{labels.position}</span><strong className="truncate font-mono tabular-nums">{positionValue}</strong></div>
            {positionCopyValue ? <button type="button" data-testid="marker-detail-position-copy" aria-label={copyState === "copied" ? labels.copied : copyState === "failed" ? labels.copyFailed : labels.copyPosition} onClick={() => void copyPosition()} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md bg-card px-2 text-xs font-semibold text-primary hover:bg-accent">{copyState === "copied" ? <IconCheck className="size-4" /> : copyState === "failed" ? <IconAlertCircle className="size-4" /> : <IconCopy className="size-4" />}<span className="max-md:hidden">{copyState === "copied" ? labels.copied : copyState === "failed" ? labels.copyFailed : labels.copyPosition}</span></button> : null}
          </div>
        ) : null}
      </header>

      <div className="grid shrink-0 grid-cols-2 border-b border-border bg-card" role="tablist" aria-label={name}>
        <button id={detailsTabId} type="button" role="tab" aria-selected={activeTab === "details"} aria-controls={detailsPanelId} onClick={() => setActiveTab("details")} className={cn("relative min-h-12 text-sm font-semibold text-muted-foreground after:absolute after:inset-x-4 after:bottom-[-1px] after:h-0.5 after:bg-transparent", activeTab === "details" && "text-primary after:bg-primary")}>{labels.details}</button>
        <button id={commentsTabId} type="button" role="tab" aria-selected={activeTab === "comments"} aria-controls={commentsPanelId} onClick={() => setActiveTab("comments")} className={cn("relative min-h-12 text-sm font-semibold text-muted-foreground after:absolute after:inset-x-4 after:bottom-[-1px] after:h-0.5 after:bg-transparent", activeTab === "comments" && "text-primary after:bg-primary")}>{labels.comments}{comments ? <span className="ml-1.5 inline-flex min-w-6 justify-center rounded-full bg-muted px-1.5 py-0.5 text-xs">{commentCount}</span> : null}</button>
      </div>

      <div data-testid="marker-detail-scroll" tabIndex={0} aria-label={labels.scrollArea} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div id={detailsPanelId} role="tabpanel" aria-labelledby={detailsTabId} hidden={activeTab !== "details"}>
          {detailSections.map((section) => <MarkerDetailCollapsibleSection key={section.id} section={section} labels={labels} />)}
          {children}
          {gallery ? <GallerySection config={gallery} labels={labels} /> : null}
        </div>
        <div id={commentsPanelId} role="tabpanel" aria-labelledby={commentsTabId} hidden={activeTab !== "comments"}>
          {comments ? <CommentList config={comments} labels={labels} /> : null}
        </div>
      </div>

      {(activeTab === "details" ? completeAction : comments?.onSubmit) ? (
        <footer className="shrink-0 border-t border-border bg-card px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-0.75rem_1.5rem_rgba(35,47,51,0.05)]">
          {activeTab === "details" && completeAction ? (
            <div className="flex justify-end"><Button data-testid="marker-complete-toggle" aria-pressed={completeAction.completed} onClick={completeAction.onToggle} className={cn("min-h-11", completeAction.completed && "bg-emerald-600 hover:bg-emerald-600/90")}><IconCheck className="size-4" stroke={2} />{completeAction.completed ? completeAction.completedLabel : completeAction.label}</Button></div>
          ) : comments?.onSubmit ? <CommentComposer config={comments} labels={labels} /> : null}
        </footer>
      ) : null}
    </aside>
  )
}

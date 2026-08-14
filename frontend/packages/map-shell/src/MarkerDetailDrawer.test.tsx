// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MarkerDetailDrawer, type MarkerDetailLabels } from "./MarkerDetailDrawer"

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(navigator, "clipboard")
  vi.restoreAllMocks()
})

const labels: MarkerDetailLabels = {
  close: "Close",
  position: "Position",
  copyPosition: "Copy",
  copied: "Copied",
  copyFailed: "Copy failed",
  details: "Details",
  comments: "Comments",
  scrollArea: "Scrollable marker content",
  collapseSection: (title) => `Collapse ${title}`,
  expandSection: (title) => `Expand ${title}`,
  description: "Marker description",
  gallery: "Player images",
  galleryDescription: "Location references",
  uploadImage: "Upload image",
  galleryReviewNote: "Images are published after review.",
  commentCount: (count) => `${count} comments`,
  popular: "Popular",
  latest: "Latest",
  like: "Like",
  reply: "Reply",
  viewReplies: (count) => `View ${count} replies`,
  commentPlaceholder: "Add a comment",
  attachImages: "Attach images",
  attachmentLimit: "Up to 3 images",
  removeImage: "Remove image",
  publish: "Publish",
  emptyDetails: "No additional details yet.",
  emptyComments: "No comments yet.",
  guestAuthor: "Guest",
  justNow: "Just now",
  awaitingReview: "Awaiting review",
}

const baseProps = {
  name: "Kingpaca",
  labels,
  onClose: vi.fn(),
}

describe("MarkerDetailDrawer", () => {
  it("keeps the shell fixed and makes only the middle viewport scrollable", () => {
    const { getByTestId } = render(<MarkerDetailDrawer {...baseProps} description="Grassland boss." />)
    const drawer = getByTestId("marker-detail-drawer")
    expect(drawer.className).toContain("overflow-hidden")
    expect(drawer.className).toContain("bottom-[calc(env(safe-area-inset-bottom)+4rem)]")
    expect(getByTestId("marker-detail-drag-handle").nextElementSibling?.tagName).toBe("HEADER")
    expect(getByTestId("marker-detail-scroll").className).toContain("overflow-y-auto")
    expect(getByTestId("marker-detail-scroll").className).toContain("[scrollbar-width:none]")
    expect(getByTestId("marker-detail-scroll").getAttribute("tabindex")).toBe("0")
  })

  it("omits empty data sections instead of rendering empty headings", () => {
    const { queryByTestId, rerender } = render(<MarkerDetailDrawer {...baseProps} description="   " />)
    expect(queryByTestId("marker-detail-section-description")).toBeNull()
    expect(queryByTestId("marker-detail-section-gallery")).toBeNull()

    rerender(<MarkerDetailDrawer {...baseProps} description="A real description." />)
    expect(queryByTestId("marker-detail-section-description")).not.toBeNull()
  })

  it("uses the same accessible disclosure control for every details section", () => {
    const { getByTestId } = render(
      <MarkerDetailDrawer {...baseProps} sections={[{ id: "drops", title: "Drops", accessibleTitle: "Drops", content: <div>Leather</div> }]} />,
    )
    const button = getByTestId("marker-detail-collapse-drops")
    expect(button.getAttribute("aria-expanded")).toBe("true")
    expect(button.querySelector("svg")?.getAttribute("class")).toContain("rotate-180")
    fireEvent.click(button)
    expect(button.getAttribute("aria-expanded")).toBe("false")
    expect(button.getAttribute("aria-label")).toBe("Expand Drops")
    expect(button.querySelector("svg")?.getAttribute("class")).not.toContain("rotate-180")
  })

  it("closes the mobile sheet when its handle is dragged down past the threshold", () => {
    const onClose = vi.fn()
    const { getByTestId } = render(<MarkerDetailDrawer {...baseProps} onClose={onClose} description="Grassland boss." />)
    const drawer = getByTestId("marker-detail-drawer")
    const handle = getByTestId("marker-detail-drag-handle")
    vi.spyOn(drawer, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 390,
      bottom: 400,
      left: 0,
      width: 390,
      height: 400,
      toJSON: () => ({}),
    })

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 100 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 220 })
    expect(drawer.style.getPropertyValue("--marker-detail-drag-y")).toBe("120px")
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 220 })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("returns the mobile sheet to rest after a short handle drag", () => {
    const onClose = vi.fn()
    const { getByTestId } = render(<MarkerDetailDrawer {...baseProps} onClose={onClose} description="Grassland boss." />)
    const drawer = getByTestId("marker-detail-drawer")
    const handle = getByTestId("marker-detail-drag-handle")

    fireEvent.pointerDown(handle, { pointerId: 2, clientY: 100 })
    fireEvent.pointerMove(handle, { pointerId: 2, clientY: 120 })
    expect(drawer.style.getPropertyValue("--marker-detail-drag-y")).toBe("20px")
    fireEvent.pointerUp(handle, { pointerId: 2, clientY: 120 })
    expect(onClose).not.toHaveBeenCalled()
    expect(drawer.style.getPropertyValue("--marker-detail-drag-y")).toBe("0px")
  })

  it("shows an initial compact preview, then fully collapses after expansion", () => {
    const { getByTestId, getByText, queryByText } = render(
      <MarkerDetailDrawer
        {...baseProps}
        sections={[{ id: "drops", title: "Drops", accessibleTitle: "Drops", defaultExpanded: false, collapsedContent: <div>Two drops</div>, content: <div>All drops</div> }]}
      />,
    )
    expect(getByText("Two drops")).not.toBeNull()
    expect(queryByText("All drops")).toBeNull()
    fireEvent.click(getByTestId("marker-detail-collapse-drops"))
    expect(getByText("All drops")).not.toBeNull()
    expect(queryByText("Two drops")).toBeNull()

    fireEvent.click(getByTestId("marker-detail-collapse-drops"))
    expect(queryByText("All drops")).toBeNull()
    expect(queryByText("Two drops")).toBeNull()
    expect(getByTestId("marker-detail-collapse-drops").getAttribute("aria-expanded")).toBe("false")
  })

  it("keeps marker gallery uploads separate from comment attachments", () => {
    const onGalleryUpload = vi.fn()
    const onSubmit = vi.fn()
    const { getByTestId, getByRole } = render(
      <MarkerDetailDrawer
        {...baseProps}
        gallery={{ markerId: "marker-1", images: [], onUpload: onGalleryUpload }}
        comments={{ markerId: "marker-1", items: [], sort: "popular", onSortChange: vi.fn(), onSubmit }}
      />,
    )
    const galleryFile = new File(["gallery"], "gallery.png", { type: "image/png" })
    fireEvent.change(getByTestId("marker-gallery-upload"), { target: { files: [galleryFile] } })
    expect(onGalleryUpload).toHaveBeenCalledWith("marker-1", [galleryFile])

    fireEvent.click(getByRole("tab", { name: /Comments/ }))
    const commentFile = new File(["comment"], "comment.png", { type: "image/png" })
    fireEvent.change(getByTestId("marker-comment-attachment"), { target: { files: [commentFile] } })
    expect(onGalleryUpload).toHaveBeenCalledTimes(1)
  })

  it("supports comment sorting, likes, replies, and publishing up to three images", async () => {
    const onSortChange = vi.fn()
    const onLike = vi.fn()
    const onReply = vi.fn()
    const onSubmit = vi.fn(() => Promise.resolve())
    const { getByRole, getByLabelText, getByTestId } = render(
      <MarkerDetailDrawer
        {...baseProps}
        comments={{
          markerId: "marker-1",
          sort: "popular",
          onSortChange,
          onLike,
          onReply,
          onSubmit,
          items: [{ id: "comment-1", markerId: "marker-1", authorName: "A", createdLabel: "Now", body: "Useful", attachments: [], likeCount: 2, replyCount: 0 }],
        }}
      />,
    )
    fireEvent.click(getByRole("tab", { name: /Comments/ }))
    fireEvent.click(getByRole("button", { name: "Latest" }))
    fireEvent.click(getByLabelText("Like"))
    fireEvent.click(getByRole("button", { name: "Reply" }))
    expect(onSortChange).toHaveBeenCalledWith("latest")
    expect(onLike).toHaveBeenCalledWith("comment-1")
    expect(onReply).toHaveBeenCalledWith("comment-1")

    const files = Array.from({ length: 4 }, (_, index) => new File([`${index}`], `${index}.png`, { type: "image/png" }))
    fireEvent.change(getByTestId("marker-comment-attachment"), { target: { files } })
    fireEvent.change(getByRole("textbox"), { target: { value: "Hello" } })
    fireEvent.click(getByRole("button", { name: "Publish" }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("marker-1", "Hello", files.slice(0, 3)))
  })

  it("appends separately selected comment images and removes individual drafts", async () => {
    const onSubmit = vi.fn(() => Promise.resolve())
    const { getByAltText, getByRole, getByTestId, queryByAltText } = render(
      <MarkerDetailDrawer
        {...baseProps}
        comments={{ markerId: "marker-1", items: [], sort: "latest", onSortChange: vi.fn(), onSubmit }}
      />,
    )
    fireEvent.click(getByRole("tab", { name: /Comments/ }))

    const first = new File(["first"], "first.png", { type: "image/png", lastModified: 1 })
    const second = new File(["second"], "second.png", { type: "image/png", lastModified: 2 })
    const input = getByTestId("marker-comment-attachment")
    fireEvent.change(input, { target: { files: [first] } })
    fireEvent.change(input, { target: { files: [second] } })

    expect(getByAltText("first.png")).not.toBeNull()
    expect(getByAltText("second.png")).not.toBeNull()
    fireEvent.click(getByRole("button", { name: "Remove image: first.png" }))
    expect(queryByAltText("first.png")).toBeNull()

    const textarea = getByTestId("marker-comment-body")
    expect(textarea.getAttribute("rows")).toBe("1")
    expect(textarea.className).toContain("max-h-28")
    fireEvent.change(textarea, { target: { value: "Useful route" } })
    fireEvent.click(getByRole("button", { name: "Publish" }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("marker-1", "Useful route", [second]))
  })

  it("renders compact gallery and completion actions in the details footer", () => {
    const { getByTestId, queryByText } = render(
      <MarkerDetailDrawer {...baseProps} gallery={{ markerId: "marker-1", images: [] }} completeAction={{ completed: false, label: "Mark as completed", completedLabel: "Completed", onToggle: vi.fn() }} />,
    )
    expect(getByTestId("marker-complete-toggle").textContent).toContain("Mark as completed")
    expect(getByTestId("marker-gallery-upload")).not.toBeNull()
    expect(queryByText("Official data")).toBeNull()
    expect(queryByText("View encyclopedia")).toBeNull()
    expect(queryByText("Exploration tip")).toBeNull()
  })

  it("uses current-session fallbacks for gallery uploads and comments", async () => {
    let objectUrlIndex = 0
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockImplementation((file) => `blob:${++objectUrlIndex}-${(file as File).name}`)
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    const { getByAltText, getByTestId, getByRole, getByText, rerender, unmount } = render(
      <MarkerDetailDrawer
        {...baseProps}
        positionCopyValue="10, 20"
        gallery={{ markerId: "marker-1", images: [] }}
        comments={{ markerId: "marker-1", items: [], sort: "latest", onSortChange: vi.fn() }}
      />,
    )

    const galleryFile = new File(["gallery"], "gallery.png", { type: "image/png" })
    fireEvent.change(getByTestId("marker-gallery-upload"), { target: { files: [galleryFile] } })
    expect(getByText("Awaiting review")).not.toBeNull()
    expect(createObjectURL).toHaveBeenCalledWith(galleryFile)
    expect(revokeObjectURL).not.toHaveBeenCalled()
    const galleryUrl = getByAltText("gallery.png").getAttribute("src")

    fireEvent.click(getByRole("tab", { name: /Comments/ }))
    const commentFile = new File(["comment"], "comment.png", { type: "image/png" })
    fireEvent.change(getByTestId("marker-comment-attachment"), { target: { files: [commentFile] } })
    fireEvent.change(getByTestId("marker-comment-body"), { target: { value: "Useful route" } })
    fireEvent.click(getByRole("button", { name: "Publish" }))
    await waitFor(() => expect(getByText("Useful route")).not.toBeNull())
    const commentImage = getByAltText("comment.png")
    const commentUrl = commentImage.getAttribute("src")
    expect(commentImage.closest("article")).not.toBeNull()
    expect(getByAltText("gallery.png").closest("figure")).not.toBeNull()
    expect(revokeObjectURL).not.toHaveBeenCalledWith(galleryUrl)
    expect(revokeObjectURL).not.toHaveBeenCalledWith(commentUrl)

    rerender(
      <MarkerDetailDrawer
        {...baseProps}
        name="Lamball"
        positionCopyValue="30, 40"
        gallery={{ markerId: "marker-2", images: [] }}
        comments={{ markerId: "marker-2", items: [], sort: "latest", onSortChange: vi.fn() }}
      />,
    )
    await waitFor(() => {
      expect(revokeObjectURL).toHaveBeenCalledWith(galleryUrl)
      expect(revokeObjectURL).toHaveBeenCalledWith(commentUrl)
    })
    unmount()
  })

  it("shows compact horizontal empty states while keeping contribution actions usable", () => {
    const { getByRole, getByTestId } = render(
      <MarkerDetailDrawer
        {...baseProps}
        gallery={{ markerId: "marker-1", images: [] }}
        comments={{ markerId: "marker-1", items: [], sort: "latest", onSortChange: vi.fn() }}
      />,
    )
    expect(getByTestId("marker-details-empty").textContent).toContain("No additional details yet.")
    expect(getByTestId("marker-details-empty").className).toContain("min-h-12")
    expect(getByTestId("marker-details-empty").className).not.toContain("flex-col")
    expect(getByTestId("marker-gallery-upload")).not.toBeNull()
    expect(getByTestId("marker-gallery-upload").parentElement?.className).toContain("border-primary")
    fireEvent.click(getByRole("tab", { name: /Comments/ }))
    expect(getByTestId("marker-comments-empty").className).toContain("min-h-12")
    expect(getByTestId("marker-comments-empty").className).not.toContain("flex-col")
  })
})

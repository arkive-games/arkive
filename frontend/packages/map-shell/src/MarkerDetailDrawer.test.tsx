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
  publish: "Publish",
}

const baseProps = {
  name: "Kingpaca",
  labels,
  onClose: vi.fn(),
}

describe("MarkerDetailDrawer", () => {
  it("keeps the shell fixed and makes only the middle viewport scrollable", () => {
    const { getByTestId } = render(<MarkerDetailDrawer {...baseProps} description="Grassland boss." />)
    expect(getByTestId("marker-detail-drawer").className).toContain("overflow-hidden")
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
    fireEvent.click(button)
    expect(button.getAttribute("aria-expanded")).toBe("false")
    expect(button.getAttribute("aria-label")).toBe("Expand Drops")
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

  it("renders only the completion action in the details footer", () => {
    const { getByTestId, queryByText } = render(
      <MarkerDetailDrawer {...baseProps} completeAction={{ completed: false, label: "Mark as completed", completedLabel: "Completed", onToggle: vi.fn() }} />,
    )
    expect(getByTestId("marker-complete-toggle").textContent).toContain("Mark as completed")
    expect(queryByText("Official data")).toBeNull()
    expect(queryByText("View encyclopedia")).toBeNull()
    expect(queryByText("Exploration tip")).toBeNull()
  })
})

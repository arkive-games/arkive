import { useEffect } from "react"

/**
 * Set `document.title` while the page is mounted. A nullish title (data still
 * loading) leaves the current one alone rather than flashing an empty tab name.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (title) document.title = title
  }, [title])
}

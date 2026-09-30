/**
 * Sequential page collection for an export run.
 *
 * Requests are deliberately serial and rate-limited. A run over a long book is
 * hundreds of round trips, so it needs progress, cancellation, and it must
 * tolerate individual failures instead of losing the whole export.
 */

import type { BookPage } from './shamela'
import { fetchPage } from './shamela'

const REQUEST_DELAY_MS = 120

export type ExportProgress = {
  total: number
  fetched: number
  failed: number
  currentPageId: number
}

export type ExportResult = {
  pages: BookPage[]
  failedPageIds: number[]
  stoppedAtEndOfBook: boolean
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function collectPages(
  bookId: number,
  fromPageId: number,
  toPageId: number,
  onProgress: (progress: ExportProgress) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  const total = Math.max(0, toPageId - fromPageId + 1)
  const pages: BookPage[] = []
  const failedPageIds: number[] = []
  let fetched = 0

  for (let pageId = fromPageId; pageId <= toPageId; pageId++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    onProgress({ total, fetched, failed: failedPageIds.length, currentPageId: pageId })

    let page: BookPage | null = null
    try {
      page = await fetchPage(bookId, pageId, signal)
    } catch (err) {
      if (signal.aborted) throw err
      // A flaky page must not cost us the rest of the book.
      failedPageIds.push(pageId)
    }

    // 404 = past the last page. This is the end-of-book signal, and the only
    // reliable one: the index page's own last-page link undercounts.
    if (page === null && !failedPageIds.includes(pageId)) break

    if (page) pages.push(page)
    fetched++

    if (pageId < toPageId) await wait(REQUEST_DELAY_MS)
  }

  onProgress({
    total,
    fetched,
    failed: failedPageIds.length,
    currentPageId: toPageId,
  })

  return {
    pages,
    failedPageIds,
    stoppedAtEndOfBook: pages.length < total,
  }
}
